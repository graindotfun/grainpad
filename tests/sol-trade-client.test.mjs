import test from 'node:test';import assert from 'node:assert/strict';
import {Keypair,PublicKey,TransactionMessage,VersionedTransaction,ComputeBudgetProgram,SystemProgram} from '@solana/web3.js';
import bs58 from 'bs58';import {signSolTrade} from '../lib/sol-trade-client.mjs';
function fixture(){const payer=Keypair.fromSeed(new Uint8Array(32).fill(9));const tx=new VersionedTransaction(new TransactionMessage({payerKey:payer.publicKey,recentBlockhash:'11111111111111111111111111111111',instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:100000}),SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:new PublicKey(new Uint8Array(32).fill(10)),lamports:1})]}).compileToV0Message());return {payer,tx,review:{owner:String(payer.publicKey),mint:'test-only',id:'a'.repeat(32),expiresAt:Date.now()+60000,minContextSlot:1,addressFingerprint:'[]',transactionBase64:Buffer.from(tx.serialize()).toString('base64'),allowDefaultZeroPrice:true,lastValidBlockHeight:1}};}
test('verified dummy-owner signature persists before forwarding and wrong relay signature rejects',async()=>{const {payer,review}=fixture(),oldFetch=globalThis.fetch;let persisted=false,attempts=0,expected;
 globalThis.fetch=async(url,init)=>{if(String(url)==='/api/rpc-session')return Response.json({ok:true});assert.equal(persisted,true);attempts++;const body=JSON.parse(init.body),t=VersionedTransaction.deserialize(Buffer.from(body.params[0],'base64'));assert.equal(bs58.encode(t.signatures[0]),expected);return Response.json({result:'wrong-relay-signature'});};
 try{await assert.rejects(signSolTrade({review,confirmReviewed:true,connection:{},preflight:async r=>({id:r.id,ok:true,slot:1}),wallet:{publicKey:payer.publicKey,signTransaction:async t=>{t.sign([payer]);return t;}},onSigned:async r=>{assert.equal(attempts,0);expected=r.signature;persisted=true;assert.ok(r.encoded);}}),/different signature/);assert.equal(attempts,1);}finally{globalThis.fetch=oldFetch;}});
test('failed signature persistence stops before any network forwarding',async()=>{const {payer,review}=fixture(),oldFetch=globalThis.fetch;let requests=0;globalThis.fetch=async()=>{requests++;throw Error('must not send');};try{await assert.rejects(signSolTrade({review,confirmReviewed:true,connection:{},preflight:async r=>({id:r.id,ok:true,slot:1}),wallet:{publicKey:payer.publicKey,signTransaction:async t=>{t.sign([payer]);return t;}},onSigned:async()=>{throw Error('storage unavailable');}}),/storage unavailable/);assert.equal(requests,0);}finally{globalThis.fetch=oldFetch;}});
test('expiry across asynchronous address resolution stops before wallet prompt',async()=>{const {payer,review}=fixture(),oldNow=Date.now;let reads=0,prompts=0;Date.now=()=>++reads===1?review.expiresAt-1:review.expiresAt;try{await assert.rejects(signSolTrade({review,confirmReviewed:true,connection:{},preflight:async r=>({id:r.id,ok:true,slot:1}),wallet:{publicKey:payer.publicKey,signTransaction:async()=>{prompts++;throw Error('must not prompt');}}}),/before approval/);assert.equal(prompts,0);}finally{Date.now=oldNow;}});
import {classifySolSubmission,SOL_SUBMIT_ATTEMPTS} from '../lib/sol-trade-client.mjs';
async function submitWith(relay,{preflight=async r=>({id:r.id,ok:true,slot:1})}={}){
 const {payer,review}=fixture(),oldFetch=globalThis.fetch,bodies=[],events=[];let signature;
 globalThis.fetch=async(url,init)=>{if(String(url)==='/api/rpc-session')return Response.json({ok:true});bodies.push(JSON.parse(init.body).params[0]);return relay(bodies.length,signature);};
 try{return {result:await signSolTrade({review,confirmReviewed:true,connection:{},preflight,onWalletRequest:()=>events.push('wallet'),wallet:{publicKey:payer.publicKey,signTransaction:async t=>{events.push('sign');t.sign([payer]);return t;}},onSigned:async r=>{signature=r.signature;events.push('signed');}}),bodies,events};}
 catch(error){return {error,bodies,events};}finally{globalThis.fetch=oldFetch;}
}
test('relay refusal after signing says not broadcast and never "nothing was sent"',async()=>{
 const {error,bodies,events}=await submitWith(()=>Response.json({error:'Wallet returned a different transaction outside the approved structure. Fee payer changed. Nothing was sent.',forwarded:false},{status:400}));
 assert.equal(bodies.length,1);assert.deepEqual(events,['wallet','sign','signed']);assert.equal(error.broadcast,'no');
 assert.match(error.message,/signed this trade, but it was not broadcast: Wallet returned a different transaction outside the approved structure\. Fee payer changed\. No funds move/);assert.doesNotMatch(error.message,/nothing was sent/i);assert.match(error.message,/keeps tracking signature/);
});
test('network preflight refusal and rate limits are reported as not broadcast without retry',async()=>{
 for(const reply of [()=>Response.json({jsonrpc:'2.0',error:{code:-32002,message:'Transaction simulation failed: custom program error'}}),()=>Response.json({error:{code:-32005,message:'Too many distinct transaction submissions.'}},{status:429})]){
  const {error,bodies}=await submitWith(reply);assert.equal(bodies.length,1);assert.equal(error.broadcast,'no');assert.doesNotMatch(error.message,/nothing was sent/i);
 }
});
test('transport failures resend only the identical signed wire, then report an uncertain submission',async()=>{
 const flaky=await submitWith((n,signature)=>{if(n<3)throw TypeError('Failed to fetch');return Response.json({jsonrpc:'2.0',result:signature});});
 assert.equal(flaky.error,undefined);assert.equal(flaky.bodies.length,3);assert.equal(new Set(flaky.bodies).size,1);
 const down=await submitWith(()=>{throw TypeError('Failed to fetch');});
 assert.equal(down.bodies.length,SOL_SUBMIT_ATTEMPTS);assert.equal(new Set(down.bodies).size,1);assert.equal(down.error.broadcast,'unknown');
 assert.match(down.error.message,/submission could not be confirmed.*It may still land/);assert.doesNotMatch(down.error.message,/nothing was sent/i);
});
test('an upstream error after forwarding is uncertain, not a refusal',async()=>{
 const {error,bodies}=await submitWith(()=>Response.json({jsonrpc:'2.0',error:{code:-32603,message:'Internal error. Nothing was sent.'}}));
 assert.equal(bodies.length,1);assert.equal(error.broadcast,'unknown');assert.doesNotMatch(error.message,/nothing was sent/i);
});
test('a closed route check never opens the wallet',async()=>{
 const {error,bodies,events}=await submitWith(()=>{throw Error('must not submit');},{preflight:async r=>({id:r.id,ok:false,reason:'route-unavailable',message:'This token is migrating from its LaunchLab curve to Raydium.'})});
 assert.deepEqual(events,[]);assert.equal(bodies.length,0);assert.match(error.message,/migrating.*Checked before opening your wallet; nothing was signed\./);
});
test('submission classifier distinguishes refusal, preflight, success and uncertainty',()=>{
 const r=(status,body)=>[{ok:status<400,status},body];
 assert.equal(classifySolSubmission(...r(200,{result:'sig'}),'sig').ok,true);
 assert.deepEqual(classifySolSubmission(...r(200,{result:'other'}),'sig'),{ok:false,broadcast:'unknown',retry:false,reason:'The relay returned a different signature.'});
 assert.equal(classifySolSubmission(...r(400,{error:'SOL review expired after its signed transaction was accepted for submission.',forwarded:false}),'sig').broadcast,'no');
 assert.equal(classifySolSubmission(...r(400,{error:'Upstream relay failed.',forwarded:true}),'sig').broadcast,'unknown');
 assert.equal(classifySolSubmission(...r(400,{error:'Legacy relay error without forwarding state.'}),'sig').broadcast,'unknown');
 assert.equal(classifySolSubmission(null,null,'sig').retry,true);assert.equal(classifySolSubmission(...r(502,{error:'Bad gateway'}),'sig').retry,true);
});
test('a refusal after an uncertain attempt stays uncertain rather than claiming no broadcast',async()=>{
 const {error,bodies}=await submitWith(n=>{if(n===1)throw TypeError('Failed to fetch');return Response.json({error:'SOL review expired after its signed transaction was accepted for submission. It may already be on chain; track its signature instead of signing again.',forwarded:false},{status:400});});
 assert.equal(bodies.length,2);assert.equal(error.broadcast,'unknown');assert.match(error.message,/may still land/);assert.doesNotMatch(error.message,/not broadcast|nothing was sent/i);
 const refused=await submitWith(n=>{if(n===1)throw TypeError('Failed to fetch');return Response.json({error:'Too many requests.',forwarded:false},{status:400});});
 assert.equal(refused.error.broadcast,'unknown');
});
test('a changed lookup mapping before approval asks for a fresh review and never opens the wallet',async()=>{
 const {payer,review}=fixture();let prompts=0,checks=0;
 await assert.rejects(signSolTrade({review:{...review,addressFingerprint:'[{"changed":true}]'},confirmReviewed:true,connection:{},preflight:async()=>{checks++;return {ok:true,slot:1};},wallet:{publicKey:payer.publicKey,signTransaction:async()=>{prompts++;}}}),/lookup tables changed after review\. Prepare a fresh review\. Nothing was signed\./);
 assert.equal(prompts,0);assert.equal(checks,0);
});
test('signed SOL submissions leave rebroadcasting to the RPC provider until expiry',async()=>{
 const {payer,review}=fixture(),oldFetch=globalThis.fetch;let config;
 globalThis.fetch=async(url,init)=>{if(String(url)==='/api/rpc-session')return Response.json({ok:true});const body=JSON.parse(init.body);config=body.params[1];return Response.json({jsonrpc:'2.0',result:bs58.encode(VersionedTransaction.deserialize(Buffer.from(body.params[0],'base64')).signatures[0])});};
 try{await signSolTrade({review,confirmReviewed:true,connection:{},preflight:async r=>({id:r.id,ok:true,slot:1}),wallet:{publicKey:payer.publicKey,signTransaction:async t=>{t.sign([payer]);return t;}}});}finally{globalThis.fetch=oldFetch;}
 assert.equal('maxRetries' in config,false);assert.equal(config.skipPreflight,false);assert.equal(config.preflightCommitment,'confirmed');
});
