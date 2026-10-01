/** Fame: one +1 or -1 vote from a Grainpad identity with verified X to another Grainpad identity.
 * Profile-to-profile reputation, not tied to any room or token. Not Sybil-proof: it is a lightweight signal. */
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {canonicalPayload} from './wallet-identity.mjs';

const ADDRESS=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FAME_FIELDS=['origin','voter','target','value','baseUpdatedAt','nonce','expires'];
const ELIGIBLE_VOTER="v.x_user_id<>'' AND v.x_verified_at IS NOT NULL";
const encoder=new TextEncoder();

export function fameMessage(p){
 const value=p.value>0?'+1':p.value<0?'-1':'0 (clear)';
 return ['Grainpad fame · reputation',`Origin: ${p.origin}`,`Voter: ${p.voter}`,`Target: ${p.target}`,`Value: ${value}`,`Base updated: ${p.baseUpdatedAt}`,`Nonce: ${p.nonce}`,`Expires: ${p.expires}`,'This gives or withdraws one public fame vote. It does not authorize a transaction.'].join('\n');
}
export function validateFamePayload(p,origin,now=Date.now()){
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==FAME_FIELDS.length||FAME_FIELDS.some(key=>!Object.hasOwn(p,key)))throw Error('Fame vote contains fields outside the signed schema.');
 if(p.origin!==origin||!ADDRESS.test(p.voter)||!ADDRESS.test(p.target)||!UUID.test(p.nonce))throw Error('Invalid fame vote.');
 if(p.voter===p.target)throw Error('You cannot give fame to yourself.');
 if(p.value!==1&&p.value!==-1&&p.value!==0)throw Error('Fame is +1, -1 or a cleared vote.');
 if(!Number.isSafeInteger(p.baseUpdatedAt)||p.baseUpdatedAt<0)throw Error('Invalid fame vote.');
 if(!Number.isSafeInteger(p.expires)||p.expires<=now||p.expires>now+10*60*1000)throw Error('Fame signature expired. Review and sign again.');
 return p;
}
/** The voter is whoever's key verifies the signature; no wallet is accepted from anywhere else. */
export function verifyFameSignature(payload,signature,origin,now=Date.now()){
 const p=validateFamePayload(payload,origin,now);
 let valid=false;
 try{const key=bs58.decode(p.voter),sig=bs58.decode(signature);valid=key.length===32&&sig.length===64&&nacl.sign.detached.verify(encoder.encode(fameMessage(p)),sig,key);}catch{valid=false;}
 if(!valid)throw Error('The voting wallet must sign this exact fame vote.');
 return p;
}
export function assertSignedVoter(body){
 if(!body||typeof body!=='object'||!body.payload||typeof body.payload!=='object')throw Error('Fame vote is incomplete.');
 if(Object.hasOwn(body,'voter')&&body.voter!==body.payload.voter)throw Error('Wallet does not match the signed proof.');
}

/** Why this viewer can or cannot vote on this target. Reads the wallet identity system only. */
export async function voteEligibility(db,voter,target){
 if(!ADDRESS.test(String(voter||''))||!ADDRESS.test(String(target||'')))return {canVote:false,reason:'invalid'};
 if(voter===target)return {canVote:false,reason:'self'};
 const mine=await db.prepare('SELECT username,x_user_id,x_verified_at FROM wallet_identity WHERE wallet=?').bind(voter).first();
 if(!mine)return {canVote:false,reason:'no-username'};
 if(!mine.x_user_id||!mine.x_verified_at)return {canVote:false,reason:'no-x'};
 const theirs=await db.prepare('SELECT 1 AS ok FROM wallet_identity WHERE wallet=?').bind(target).first();
 if(!theirs)return {canVote:false,reason:'no-target'};
 return {canVote:true,reason:null};
}
const REASONS={self:'You cannot give fame to yourself.','no-username':'Claim a Grainpad username to give fame.','no-x':'Connect X to give fame.','no-target':'This wallet has no Grainpad identity.',invalid:'Invalid wallet.'};

/** Public score counts only votes from voters who currently hold a verified X link.
 * @param {any} db @param {string} target @param {string|null} [viewer] */
export async function fameSummary(db,target,viewer=null){
 if(!ADDRESS.test(String(target||'')))throw Error('Invalid wallet.');
 const tally=await db.prepare(`SELECT COALESCE(SUM(f.value),0) AS score,COALESCE(SUM(f.value=1),0) AS up,COALESCE(SUM(f.value=-1),0) AS down
  FROM wallet_fame f JOIN wallet_identity v ON v.wallet=f.voter AND ${ELIGIBLE_VOTER} WHERE f.target=?`).bind(target).first();
 const summary={target,score:Number(tally?.score||0),up:Number(tally?.up||0),down:Number(tally?.down||0),viewer:null};
 if(viewer&&ADDRESS.test(viewer)){
  const vote=await db.prepare('SELECT value,updated_at FROM wallet_fame WHERE voter=? AND target=?').bind(viewer,target).first();
  const eligibility=await voteEligibility(db,viewer,target);
  summary.viewer={wallet:viewer,value:vote?Number(vote.value):0,updatedAt:vote?Number(vote.updated_at):0,canVote:eligibility.canVote,reason:eligibility.reason,message:eligibility.reason?REASONS[eligibility.reason]||'':''};
 }
 return summary;
}

function constraint(error){
 const message=String(error?.message||error);
 if(!/constraint/i.test(message))throw error;
 throw Error('Your fame vote changed or is no longer eligible. Review and sign again.');
}
async function commit(db,statements){
 if(typeof db.batch!=='function')throw Error('Fame storage is unavailable.');
 try{await db.batch(statements);}catch(error){constraint(error);}
}
/** Apply one signed vote. Every write is guarded by the exact state the voter reviewed and by current eligibility;
 * a miss fails the whole batch so a stale or ineligible signature changes nothing. The signature is the revision id. */
export async function applyFame(db,payload,signature,origin,now=Date.now()){
 const p=verifyFameSignature(payload,signature,origin,now),stored=canonicalPayload(p);
 const prior=await db.prepare('SELECT payload FROM wallet_fame_revision WHERE id=?').bind(signature).first();
 if(prior){
  if(prior.payload!==stored)throw Error('This signature was already used.');
  return fameSummary(db,p.target,p.voter);
 }
 if(p.value!==0){const eligibility=await voteEligibility(db,p.voter,p.target);if(!eligibility.canVote)throw Error(REASONS[eligibility.reason]||'You cannot vote.');}
 const current=await db.prepare('SELECT value,updated_at FROM wallet_fame WHERE voter=? AND target=?').bind(p.voter,p.target).first();
 const base=current?Number(current.updated_at):0;
 if(p.baseUpdatedAt!==base)throw Error('Your fame vote changed. Review and sign again.');
 const stamp=Math.max(now,base+1);
 if(p.value===0){
  if(!current)throw Error('You have not given this profile fame.');
  await commit(db,[
   db.prepare('INSERT INTO wallet_fame_revision(id,voter,target,value,created_at,payload) VALUES(?,(SELECT voter FROM wallet_fame WHERE voter=? AND target=? AND updated_at=?),?,0,?,?)').bind(signature,p.voter,p.target,base,p.target,stamp,stored),
   db.prepare('DELETE FROM wallet_fame WHERE voter=? AND target=? AND updated_at=?').bind(p.voter,p.target,base),
  ]);
 }else{
  if(current&&Number(current.value)===p.value)throw Error('That fame vote is already recorded.');
  await commit(db,[
   db.prepare(`INSERT INTO wallet_fame(voter,target,value,updated_at,signature,payload)
    SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM wallet_identity v WHERE v.wallet=? AND ${ELIGIBLE_VOTER}) AND EXISTS(SELECT 1 FROM wallet_identity t WHERE t.wallet=?)
    AND COALESCE((SELECT updated_at FROM wallet_fame WHERE voter=? AND target=?),0)=?
    ON CONFLICT(voter,target) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,signature=excluded.signature,payload=excluded.payload WHERE wallet_fame.updated_at=?`)
    .bind(p.voter,p.target,p.value,stamp,signature,stored,p.voter,p.target,p.voter,p.target,base,base),
   db.prepare('INSERT INTO wallet_fame_revision(id,voter,target,value,created_at,payload) VALUES(?,(SELECT voter FROM wallet_fame WHERE voter=? AND target=? AND signature=? AND updated_at=?),?,?,?,?)').bind(signature,p.voter,p.target,signature,stamp,p.target,p.value,stamp,stored),
  ]);
 }
 return fameSummary(db,p.target,p.voter);
}
