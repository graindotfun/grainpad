import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {roomMessage,validateRoomPayload} from './room-message.mjs';
import {crewBoard} from './crew.mjs';

export function verifyRoomPublication(payload,signature,origin,mint,now=Date.now()){
 validateRoomPayload(payload,origin,mint,now);
 let valid=false;try{const key=bs58.decode(payload.author),sig=bs58.decode(signature);valid=key.length===32&&sig.length===64&&nacl.sign.detached.verify(new TextEncoder().encode(roomMessage(payload)),sig,key);}catch{}
 if(!valid)throw Error('The publishing wallet must sign this exact message.');
 return payload;
}

/** Append-only records and atomic relationship checks. A nonce retry cannot publish twice. */
/** A payment record must arrive with the server's finalized-transfer verification for this exact payload.
 * @param {any} db @param {any} p @param {string} signature @param {string} creator @param {number} [now]
 * @param {{verification?:Record<string,any>|null}} [options] */
export async function publishRoomEvent(db,p,signature,creator,now=Date.now(),options={}){
 const verification=options.verification??null;
 if(p&&p.kind!=='submission'&&p.author!==creator)throw Error('Only the on-chain creator can publish this action.');
 validateRoomPayload(p,p?.origin,p?.mint,now);
 const previous=await db.prepare('SELECT * FROM room_event WHERE id=?').bind(p.nonce).first();
 const signed=JSON.stringify(p);
 if(previous){if(previous.payload!==signed||previous.signature!==signature)throw Error('This publication ID is already used.');return previous;}
 let condition='1',args=[];
 if(p.kind==='submission'){
  condition="EXISTS(SELECT 1 FROM room_event n WHERE n.id=? AND n.mint=? AND n.kind='need' AND NOT EXISTS(SELECT 1 FROM room_event c WHERE c.mint=n.mint AND c.target=n.id AND c.kind='close'))";args=[p.target,p.mint];
 }else if(p.kind==='credit'||p.kind==='close'||p.kind==='approve'){
  condition='EXISTS(SELECT 1 FROM room_event t WHERE t.id=? AND t.mint=? AND t.kind=?)';args=[p.target,p.mint,p.kind==='close'?'need':'submission'];
 }else if(p.kind==='budget'){
  // One public promise per open need: it cannot be quietly lowered later.
  condition="EXISTS(SELECT 1 FROM room_event n WHERE n.id=? AND n.mint=? AND n.kind='need' AND NOT EXISTS(SELECT 1 FROM room_event c WHERE c.mint=n.mint AND c.target=n.id AND c.kind='close'))";args=[p.target,p.mint];
 }else if(p.kind==='payment'){
  if(verification?.status!=='verified'||verification.signature!==p.body||verification.payer!==creator||verification.asset!==p.title)throw Error('Payment proof must be verified from a finalized transaction before it is recorded.');
  condition="EXISTS(SELECT 1 FROM room_event s WHERE s.id=? AND s.mint=? AND s.kind='submission' AND s.author=? AND EXISTS(SELECT 1 FROM room_event a WHERE a.mint=s.mint AND a.target=s.id AND a.kind='approve'))";args=[p.target,p.mint,verification.recipient];
 }
 // A transaction proves one payment once, across every room.
 const dedupe=['credit','close','budget','approve'].includes(p.kind)?`${p.mint}:${p.kind}:${p.target}`:p.kind==='payment'?`payment:${p.body}`:null;
 const proof=p.kind==='payment'?JSON.stringify(verification):null;
 const result=await db.prepare(`INSERT INTO room_event(id,mint,author,kind,title,body,url,target,created_at,payload,signature,dedupe,verification)
 SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${condition} ON CONFLICT DO NOTHING RETURNING *`).bind(p.nonce,p.mint,p.author,p.kind,p.title,p.body,p.url,p.target,now,signed,signature,dedupe,proof,...args).first();
 if(!result){const retry=await db.prepare('SELECT * FROM room_event WHERE id=?').bind(p.nonce).first();if(retry?.payload===signed&&retry?.signature===signature)return retry;throw Error('The related record changed or this action was already recorded. Refresh the room.');}
 return result;
}

/** @param {{before?:string|null,need?:string|null,limit?:number}} options */
export async function roomPage(db,mint,options={}){
 const {before=null,need=null,limit=30}=options;
 if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Invalid page size.');
 let cursor=null;if(before){cursor=await db.prepare('SELECT id,created_at FROM room_event WHERE mint=? AND id=?').bind(mint,before).first();if(!cursor)throw Error('Invalid room cursor.');}
 const rows=await db.prepare(`SELECT e.*,EXISTS(SELECT 1 FROM room_event c WHERE c.mint=e.mint AND c.target=e.id AND c.kind='credit') AS credited,
 EXISTS(SELECT 1 FROM room_event c WHERE c.mint=e.mint AND c.target=e.id AND c.kind='close') AS closed,
 EXISTS(SELECT 1 FROM room_event c WHERE c.mint=e.mint AND c.target=e.id AND c.kind='approve') AS approved,
 (SELECT count(*) FROM room_event c WHERE c.mint=e.mint AND c.target=e.id AND c.kind='payment') AS payments
 FROM room_event e WHERE mint=?${need?' AND (e.id=? OR e.target=? OR EXISTS(SELECT 1 FROM room_event s WHERE s.mint=e.mint AND s.id=e.target AND s.target=?))':''}${cursor?' AND (created_at<? OR (created_at=? AND id<?))':''} ORDER BY created_at DESC,id DESC LIMIT ?`).bind(mint,...(need?[need,need,need]:[]),...(cursor?[cursor.created_at,cursor.created_at,cursor.id]:[]),limit+1).all();
 const events=rows.results.slice(0,limit);
 const needs=await db.prepare("SELECT n.id,n.title,n.body,n.url,n.created_at FROM room_event n WHERE n.mint=? AND n.kind='need' AND NOT EXISTS(SELECT 1 FROM room_event c WHERE c.mint=n.mint AND c.target=n.id AND c.kind='close') ORDER BY n.created_at DESC,n.id DESC LIMIT 100").bind(mint).all();
 const stats=await db.prepare("SELECT count(*) AS records,sum(kind='submission') AS submissions,sum(kind='credit') AS credits,count(DISTINCT CASE WHEN kind='submission' THEN author END) AS contributors FROM room_event WHERE mint=?").bind(mint).first();
 return {events,needs:needs.results,nextCursor:rows.results.length>limit?events.at(-1).id:null,stats,needsLimit:100,crew:await crewTasks(db,mint)};
}

/** The Crew board: every task (open or closed) with its promise, approvals and verified payments. */
export async function crewTasks(db,mint){
 const tasks=await db.prepare(`SELECT n.id,n.title,n.body,n.url,n.created_at,
 EXISTS(SELECT 1 FROM room_event c WHERE c.mint=n.mint AND c.target=n.id AND c.kind='close') AS closed,
 (SELECT count(*) FROM room_event s WHERE s.mint=n.mint AND s.target=n.id AND s.kind='submission') AS submissions,
 b.body AS budget_amount,b.title AS budget_asset,b.signature AS budget_signature
 FROM room_event n LEFT JOIN room_event b ON b.mint=n.mint AND b.target=n.id AND b.kind='budget'
 WHERE n.mint=? AND n.kind='need' ORDER BY n.created_at DESC,n.id DESC LIMIT 100`).bind(mint).all();
 const approvals=await db.prepare(`SELECT a.target AS submission,s.target AS need,s.author AS contributor,s.title,a.created_at FROM room_event a JOIN room_event s ON s.id=a.target AND s.mint=a.mint
 WHERE a.mint=? AND a.kind='approve' ORDER BY a.created_at LIMIT 500`).bind(mint).all();
 const payments=await db.prepare(`SELECT p.target AS submission,s.target AS need,s.author AS contributor,p.verification FROM room_event p JOIN room_event s ON s.id=p.target AND s.mint=p.mint
 WHERE p.mint=? AND p.kind='payment' ORDER BY p.created_at LIMIT 500`).bind(mint).all();
 return crewBoard(tasks.results,approvals.results,payments.results);
}

/** One wallet's public contribution history across every room.
 * @returns {Promise<{id:string,mint:string,title:string,url:string,created_at:number,need_title:string|null,credited:boolean,approved:boolean,payments:any[]}[]>} */
export async function crewRecord(db,wallet,{limit=50}={}){
 const rows=await db.prepare(`SELECT s.id,s.mint,s.title,s.url,s.created_at,n.title AS need_title,
 EXISTS(SELECT 1 FROM room_event c WHERE c.mint=s.mint AND c.target=s.id AND c.kind='credit') AS credited,
 EXISTS(SELECT 1 FROM room_event c WHERE c.mint=s.mint AND c.target=s.id AND c.kind='approve') AS approved,
 (SELECT json_group_array(json(p.verification)) FROM room_event p WHERE p.mint=s.mint AND p.target=s.id AND p.kind='payment') AS payments
 FROM room_event s LEFT JOIN room_event n ON n.id=s.target AND n.mint=s.mint
 WHERE s.author=? AND s.kind='submission' ORDER BY s.created_at DESC,s.id DESC LIMIT ?`).bind(wallet,limit).all();
 return rows.results.map(r=>({...r,credited:Boolean(r.credited),approved:Boolean(r.approved),payments:JSON.parse(r.payments||'[]').filter(Boolean)}));
}
