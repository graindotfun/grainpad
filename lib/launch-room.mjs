import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {roomMessage,validateRoomPayload} from './room-message.mjs';

export function verifyRoomPublication(payload,signature,origin,mint,now=Date.now()){
 validateRoomPayload(payload,origin,mint,now);
 let valid=false;try{const key=bs58.decode(payload.author),sig=bs58.decode(signature);valid=key.length===32&&sig.length===64&&nacl.sign.detached.verify(new TextEncoder().encode(roomMessage(payload)),sig,key);}catch{}
 if(!valid)throw Error('The publishing wallet must sign this exact message.');
 return payload;
}

/** Append-only records and atomic relationship checks. A nonce retry cannot publish twice. */
export async function publishRoomEvent(db,p,signature,creator,now=Date.now()){
 if(p.kind!=='submission'&&p.author!==creator)throw Error('Only the on-chain creator can publish this action.');
 const previous=await db.prepare('SELECT * FROM room_event WHERE id=?').bind(p.nonce).first();
 const signed=JSON.stringify(p);
 if(previous){if(previous.payload!==signed||previous.signature!==signature)throw Error('This publication ID is already used.');return previous;}
 let condition='1',args=[];
 if(p.kind==='submission'){
  condition="EXISTS(SELECT 1 FROM room_event n WHERE n.id=? AND n.mint=? AND n.kind='need' AND NOT EXISTS(SELECT 1 FROM room_event c WHERE c.mint=n.mint AND c.target=n.id AND c.kind='close'))";args=[p.target,p.mint];
 }else if(p.kind==='credit'||p.kind==='close'){
  condition='EXISTS(SELECT 1 FROM room_event t WHERE t.id=? AND t.mint=? AND t.kind=?)';args=[p.target,p.mint,p.kind==='credit'?'submission':'need'];
 }
 const dedupe=['credit','close'].includes(p.kind)?`${p.mint}:${p.kind}:${p.target}`:null;
 const result=await db.prepare(`INSERT INTO room_event(id,mint,author,kind,title,body,url,target,created_at,payload,signature,dedupe)
 SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ${condition} ON CONFLICT DO NOTHING RETURNING *`).bind(p.nonce,p.mint,p.author,p.kind,p.title,p.body,p.url,p.target,now,signed,signature,dedupe,...args).first();
 if(!result){const retry=await db.prepare('SELECT * FROM room_event WHERE id=?').bind(p.nonce).first();if(retry?.payload===signed&&retry?.signature===signature)return retry;throw Error('The related record changed or this action was already recorded. Refresh the room.');}
 return result;
}

/** @param {{before?:string|null,need?:string|null,limit?:number}} options */
export async function roomPage(db,mint,options={}){
 const {before=null,need=null,limit=30}=options;
 if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Invalid page size.');
 let cursor=null;if(before){cursor=await db.prepare('SELECT id,created_at FROM room_event WHERE mint=? AND id=?').bind(mint,before).first();if(!cursor)throw Error('Invalid room cursor.');}
 const rows=await db.prepare(`SELECT e.*,EXISTS(SELECT 1 FROM room_event c WHERE c.mint=e.mint AND c.target=e.id AND c.kind='credit') AS credited,
 EXISTS(SELECT 1 FROM room_event c WHERE c.mint=e.mint AND c.target=e.id AND c.kind='close') AS closed
 FROM room_event e WHERE mint=?${need?' AND (e.id=? OR e.target=? OR EXISTS(SELECT 1 FROM room_event s WHERE s.mint=e.mint AND s.id=e.target AND s.target=?))':''}${cursor?' AND (created_at<? OR (created_at=? AND id<?))':''} ORDER BY created_at DESC,id DESC LIMIT ?`).bind(mint,...(need?[need,need,need]:[]),...(cursor?[cursor.created_at,cursor.created_at,cursor.id]:[]),limit+1).all();
 const events=rows.results.slice(0,limit);
 const needs=await db.prepare("SELECT n.id,n.title,n.body,n.url,n.created_at FROM room_event n WHERE n.mint=? AND n.kind='need' AND NOT EXISTS(SELECT 1 FROM room_event c WHERE c.mint=n.mint AND c.target=n.id AND c.kind='close') ORDER BY n.created_at DESC,n.id DESC LIMIT 100").bind(mint).all();
 const stats=await db.prepare("SELECT count(*) AS records,sum(kind='submission') AS submissions,sum(kind='credit') AS credits,count(DISTINCT CASE WHEN kind='submission' THEN author END) AS contributors FROM room_event WHERE mint=?").bind(mint).first();
 return {events,needs:needs.results,nextCursor:rows.results.length>limit?events.at(-1).id:null,stats,needsLimit:100};
}
