import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {applyFame,assertSignedVoter,fameMessage,fameSummary,validateFamePayload,verifyFameSignature,voteEligibility} from '../lib/wallet-fame.mjs';

const origin='https://grainpad.fun';
function database(){
 const sqlite=new DatabaseSync(':memory:');
 for(const file of ['0024_wallet_identity.sql','0025_fame_and_funding_status.sql'])for(const sql of readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8').split('--> statement-breakpoint'))if(sql.trim())sqlite.exec(sql);
 return {sqlite,prepare(sql){const stmt=sqlite.prepare(sql);const bound=(...values)=>({first:async()=>stmt.get(...values)??null,all:async()=>({results:stmt.all(...values)}),run:()=>stmt.run(...values)});return {bind:bound,...bound()};},async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const result=[];for(const statement of statements)result.push(statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
}
function wallet(){const pair=nacl.sign.keyPair();return {pair,address:bs58.encode(pair.publicKey)};}
let counter=0;
function profile(db,w,{x=false,name}={}){
 counter+=1;const username=name||`user${counter}`;
 db.sqlite.prepare("INSERT INTO wallet_identity(wallet,username,display_name,avatar_hash,bio,x_user_id,x_username,x_avatar_hash,x_verified_at,created_at,updated_at,signature,payload) VALUES(?,?,?,'','',?,?,'',?,1,1,'s','{}')").run(w.address,username,username,x?`x${counter}`:'',x?`x_${counter}`:'',x?1:null);
}
function vote(voter,target,value,{base=0,expires=Date.now()+60_000,nonce=crypto.randomUUID()}={}){
 const payload={origin,voter:voter.address,target:target.address,value,baseUpdatedAt:base,nonce,expires};
 return {payload,signature:bs58.encode(nacl.sign.detached(new TextEncoder().encode(fameMessage(payload)),voter.pair.secretKey))};
}
const cast=(db,v,t,value,options,now)=>{const {payload,signature}=vote(v,t,value,options);return applyFame(db,payload,signature,origin,now===undefined?undefined:Date.now()+now);};
const stored=(db,voter,target)=>db.sqlite.prepare('SELECT * FROM wallet_fame WHERE voter=? AND target=?').get(voter.address,target.address);

test('score is the sum of active votes from verified-X voters',async()=>{
 const db=database(),target=wallet(),voters=[wallet(),wallet(),wallet(),wallet()];
 profile(db,target);for(const v of voters)profile(db,v,{x:true});
 for(const v of voters.slice(0,3))await cast(db,v,target,1);
 const summary=await cast(db,voters[3],target,-1);
 assert.equal(summary.score,2);assert.equal(summary.up,3);assert.equal(summary.down,1);
 assert.deepEqual((await fameSummary(db,target.address)).viewer,null);
});
test('a wallet-only visitor, a username without X and the target themself cannot vote',async()=>{
 const db=database(),target=wallet(),anon=wallet(),noX=wallet(),verified=wallet();
 profile(db,target,{x:true});profile(db,noX);profile(db,verified,{x:true});
 await assert.rejects(()=>cast(db,anon,target,1),/username/);
 await assert.rejects(()=>cast(db,noX,target,1),/Connect X/);
 await assert.rejects(()=>cast(db,target,target,1),/yourself/);
 assert.equal((await voteEligibility(db,anon.address,target.address)).reason,'no-username');
 assert.equal((await voteEligibility(db,noX.address,target.address)).reason,'no-x');
 assert.equal((await voteEligibility(db,target.address,target.address)).reason,'self');
 assert.equal((await voteEligibility(db,verified.address,target.address)).canVote,true);
 assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM wallet_fame').get().n,0);
});
test('the target must be a Grainpad identity',async()=>{
 const db=database(),target=wallet(),voter=wallet();profile(db,voter,{x:true});
 await assert.rejects(()=>cast(db,voter,target,1),/no Grainpad identity/);
});
test('one active state per pair: change +1 to -1 and back, clear, never stack',async()=>{
 const db=database(),target=wallet(),voter=wallet();profile(db,target);profile(db,voter,{x:true});
 let s=await cast(db,voter,target,1,{base:0},1000);assert.equal(s.score,1);
 const first=stored(db,voter,target);assert.equal(first.value,1);
 await assert.rejects(()=>cast(db,voter,target,1,{base:first.updated_at}),/already recorded/);
 s=await cast(db,voter,target,-1,{base:first.updated_at},2000);assert.equal((await fameSummary(db,target.address)).score,-1);
 const second=stored(db,voter,target);assert.equal(second.value,-1);
 s=await cast(db,voter,target,1,{base:second.updated_at},3000);assert.equal((await fameSummary(db,target.address)).score,1);
 const third=stored(db,voter,target);
 s=await cast(db,voter,target,0,{base:third.updated_at},4000);
 assert.equal(stored(db,voter,target),undefined);assert.equal(s.score,0);assert.equal(s.viewer.value,0);
 await assert.rejects(()=>cast(db,voter,target,0,{base:0}),/not given/);
 assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM wallet_fame').get().n,0);
 const history=db.sqlite.prepare('SELECT value FROM wallet_fame_revision ORDER BY created_at').all().map(r=>r.value);
 assert.deepEqual(history,[1,-1,1,0]);
});
test('a stale base version is rejected and changes nothing',async()=>{
 const db=database(),target=wallet(),voter=wallet();profile(db,target);profile(db,voter,{x:true});
 await cast(db,voter,target,1,{base:0},1000);
 await assert.rejects(()=>cast(db,voter,target,-1,{base:0}),/changed/);
 assert.equal(stored(db,voter,target).value,1);
});
test('signature binds voter, target, value, origin and expiry; a replay never re-applies',async()=>{
 const db=database(),target=wallet(),other=wallet(),voter=wallet(),thief=wallet();
 profile(db,target);profile(db,other);profile(db,voter,{x:true});profile(db,thief,{x:true});
 const {payload,signature}=vote(voter,target,1);
 assert.throws(()=>verifyFameSignature({...payload,target:other.address},signature,origin),/sign this exact/);
 assert.throws(()=>verifyFameSignature({...payload,value:-1},signature,origin),/sign this exact/);
 assert.throws(()=>verifyFameSignature({...payload,voter:thief.address},signature,origin),/sign this exact/);
 assert.throws(()=>verifyFameSignature(payload,signature,'https://evil.example'),/Invalid/);
 assert.throws(()=>verifyFameSignature({...payload,expires:Date.now()-1},signature,origin),/expired/);
 assert.throws(()=>verifyFameSignature({...payload,expires:Date.now()+3_600_000},signature,origin),/expired/);
 assert.throws(()=>validateFamePayload({...payload,extra:1},origin),/schema/);
 assert.throws(()=>validateFamePayload({...payload,value:2},origin),/\+1, -1/);
 assert.throws(()=>assertSignedVoter({voter:thief.address,payload}),/does not match/);
 await applyFame(db,payload,signature,origin,Date.now()+1000);
 const state=stored(db,voter,target);
 const again=await applyFame(db,payload,signature,origin,Date.now()+5000);assert.equal(again.score,1);assert.equal(again.up,1);
 assert.deepEqual(stored(db,voter,target),state);
 await cast(db,voter,target,-1,{base:state.updated_at},6000);
 await applyFame(db,payload,signature,origin,Date.now()+7000);
 assert.equal(stored(db,voter,target).value,-1);
 const reused=vote(voter,target,-1);
 await assert.rejects(()=>applyFame(db,{...reused.payload,value:1},signature,origin),/sign this exact|already used/);
});
test('votes from a voter who disconnects X stop counting and count again on reconnect',async()=>{
 const db=database(),target=wallet(),a=wallet(),b=wallet();profile(db,target);profile(db,a,{x:true});profile(db,b,{x:true});
 await cast(db,a,target,1);await cast(db,b,target,1);
 assert.equal((await fameSummary(db,target.address)).score,2);
 db.sqlite.prepare("UPDATE wallet_identity SET x_user_id='',x_username='',x_verified_at=NULL WHERE wallet=?").run(a.address);
 assert.equal((await fameSummary(db,target.address)).score,1);
 db.sqlite.prepare("UPDATE wallet_identity SET x_user_id='xa',x_verified_at=5 WHERE wallet=?").run(a.address);
 assert.equal((await fameSummary(db,target.address)).score,2);
});
test('a guarded write fails whole when eligibility is lost between read and write',async()=>{
 const db=database(),target=wallet(),voter=wallet();profile(db,target);profile(db,voter,{x:true});
 const {payload,signature}=vote(voter,target,1);
 const real=db.prepare.bind(db);let armed=true;
 db.prepare=sql=>{const q=real(sql);if(armed&&/FROM wallet_fame WHERE voter/.test(sql)&&/^SELECT value/.test(sql)){return {...q,bind:(...v)=>({...q.bind(...v),first:async()=>{const r=await q.bind(...v).first();db.sqlite.prepare("UPDATE wallet_identity SET x_user_id='',x_verified_at=NULL WHERE wallet=?").run(voter.address);armed=false;return r;}})};}return q;};
 await assert.rejects(()=>applyFame(db,payload,signature,origin),/no longer eligible/);
 assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM wallet_fame').get().n,0);
 assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM wallet_fame_revision').get().n,0);
});
test('the table refuses a self vote or a value outside +1/-1 even if code is bypassed',()=>{
 const db=database(),a=wallet();
 assert.throws(()=>db.sqlite.prepare("INSERT INTO wallet_fame VALUES(?,?,1,1,'s','{}')").run(a.address,a.address),/constraint/i);
 assert.throws(()=>db.sqlite.prepare("INSERT INTO wallet_fame VALUES('a','b',2,1,'s','{}')").run(),/constraint/i);
});
test('one verified X account cannot back two wallets',()=>{
 const db=database(),a=wallet(),b=wallet();profile(db,a,{x:true});
 const x=db.sqlite.prepare('SELECT x_user_id FROM wallet_identity WHERE wallet=?').get(a.address).x_user_id;
 profile(db,b);
 assert.throws(()=>db.sqlite.prepare('UPDATE wallet_identity SET x_user_id=?,x_verified_at=1 WHERE wallet=?').run(x,b.address),/constraint/i);
});
test('fame never uses the token-level creator_profile twitter field or any weight',()=>{
 const source=readFileSync(new URL('../lib/wallet-fame.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/creator_profile|twitter|balance|holder|follower/i);
});

test('a +1 to -1 change is atomic: losing eligibility mid-write leaves the old vote and no new revision',async()=>{
 const db=database(),target=wallet(),voter=wallet();profile(db,target);profile(db,voter,{x:true});
 await cast(db,voter,target,1,{base:0},1000);const before=stored(db,voter,target);
 const {payload,signature}=vote(voter,target,-1,{base:before.updated_at});
 const real=db.prepare.bind(db);let armed=true;
 db.prepare=sql=>{const q=real(sql);if(armed&&/^SELECT value,updated_at FROM wallet_fame WHERE voter/.test(sql)){return {...q,bind:(...v)=>({...q.bind(...v),first:async()=>{const r=await q.bind(...v).first();db.sqlite.prepare("UPDATE wallet_identity SET x_user_id='',x_verified_at=NULL WHERE wallet=?").run(voter.address);armed=false;return r;}})};}return q;};
 await assert.rejects(()=>applyFame(db,payload,signature,origin,Date.now()+5000),/no longer eligible/);
 assert.deepEqual(stored(db,voter,target),before);
 assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM wallet_fame_revision').get().n,1);
});
test('two racing votes on the same base: exactly one wins and the pair keeps one state',async()=>{
 const db=database(),target=wallet(),voter=wallet();profile(db,target);profile(db,voter,{x:true});
 const a=vote(voter,target,1),b=vote(voter,target,-1);
 const results=await Promise.allSettled([applyFame(db,a.payload,a.signature,origin),applyFame(db,b.payload,b.signature,origin)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM wallet_fame WHERE voter=? AND target=?').get(voter.address,target.address).n,1);
 assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM wallet_fame_revision').get().n,1);
});
test('repeating the active vote is refused; the intended way to cancel is a signed clear',async()=>{
 const db=database(),target=wallet(),voter=wallet();profile(db,target);profile(db,voter,{x:true});
 await cast(db,voter,target,1,{base:0},1000);const row=stored(db,voter,target);
 await assert.rejects(()=>cast(db,voter,target,1,{base:row.updated_at}),/already recorded/);
 assert.equal((await cast(db,voter,target,0,{base:row.updated_at},3000)).score,0);
});
