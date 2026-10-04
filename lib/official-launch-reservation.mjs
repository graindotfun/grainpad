import {Buffer} from 'buffer';
import {submittedSignature} from './rpc-submissions.mjs';
import {metadataHashFromUri,contentHash} from './metadata-publication.mjs';
import {OFFICIAL_DECLARED_CREATOR_BUY,OFFICIAL_GENERATION,OFFICIAL_LAUNCH_CREATOR} from './official-launch-policy.mjs';
const hex=/^[a-f0-9]{64}$/;
const changes=result=>result?.meta?.changes??result?.changes;
/** Called only after the official pins and the exact message have been checked. Signed bytes never enter storage. */
export async function officialLaunchIntent(tx,launch,expiry){
 const signature=submittedSignature(Buffer.from(tx.serialize()).toString('base64'));
 if(!Number.isSafeInteger(expiry)||expiry<1)throw Error('Official launch expiry is missing.');
 const creator=String(tx.message.staticAccountKeys[0]);
 if(creator!==OFFICIAL_LAUNCH_CREATOR)throw Error('Official launch fee payer is not the locked creator wallet.');
 return {mint:launch.mint,creator,metadataHash:metadataHashFromUri(launch.uri,'https://grainpad.fun'),messageHash:await contentHash(tx.message.serialize()),signature,blockhash:tx.message.recentBlockhash,expiry,generation:OFFICIAL_GENERATION,buyQuote:OFFICIAL_DECLARED_CREATOR_BUY.quote,buyAmountIn:OFFICIAL_DECLARED_CREATOR_BUY.amountIn,buyMinOut:OFFICIAL_DECLARED_CREATOR_BUY.minOut};
}
function complete(intent){
 const {mint,creator,metadataHash,messageHash,signature,blockhash,expiry}=intent??{};
 const generation=intent?.generation??OFFICIAL_GENERATION,buyQuote=intent?.buyQuote??OFFICIAL_DECLARED_CREATOR_BUY.quote,buyAmountIn=intent?.buyAmountIn??OFFICIAL_DECLARED_CREATOR_BUY.amountIn,buyMinOut=intent?.buyMinOut??OFFICIAL_DECLARED_CREATOR_BUY.minOut;
 if(!mint||!creator||!signature||!blockhash||!hex.test(metadataHash)||!hex.test(messageHash)||!Number.isSafeInteger(expiry)||expiry<1)throw Error('Incomplete official launch intent.');
 if(generation!==OFFICIAL_GENERATION||buyQuote!==OFFICIAL_DECLARED_CREATOR_BUY.quote||buyAmountIn!==OFFICIAL_DECLARED_CREATOR_BUY.amountIn||buyMinOut!==OFFICIAL_DECLARED_CREATOR_BUY.minOut)throw Error('Declared creator buy does not match the approved pin.');
 return {mint,creator,metadataHash,messageHash,signature,blockhash,expiry,generation,buyQuote,buyAmountIn,buyMinOut};
}
/** A singleton protects the one official launch. The same intent is idempotent. A different identity conflicts. */
export async function reserveOfficialLaunch(db,intent){
 const next=complete(intent);
 await db.prepare('INSERT INTO official_launch_reservation (id,generation,mint,creator,metadata_hash,message_hash,signature,blockhash,expiry,state,created_at,buy_quote,buy_amount_in,buy_min_out) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(next.generation,next.mint,next.creator,next.metadataHash,next.messageHash,next.signature,next.blockhash,next.expiry,'reserved',Date.now(),next.buyQuote,next.buyAmountIn,next.buyMinOut).run();
 const row=await readOfficialLaunchReservation(db);
 if(!row)throw Error('Official launch reservation was not recorded.');
 if(row.state==='registered')throw Error('Official GRAIN has already launched. A second launch is not reserved.');
 if(row.generation!==undefined&&row.generation!==next.generation)throw Error('A different official launch generation is already reserved.');
 if((row.buy_amount_in&&row.buy_amount_in!==next.buyAmountIn)||(row.buy_min_out&&row.buy_min_out!==next.buyMinOut))throw Error('Declared creator buy does not match the approved pin.');
 if(row.mint!==next.mint||row.creator!==next.creator||row.metadata_hash!==next.metadataHash)throw Error('A different official launch identity is already reserved.');
 if(row.message_hash!==next.messageHash||row.signature!==next.signature||row.blockhash!==next.blockhash||row.expiry!==next.expiry)throw Error('A different official launch intent is already reserved. Reconcile its signature before any new review.');
 return row;
}
export async function readOfficialLaunchReservation(db){return db.prepare('SELECT mint,creator,metadata_hash,message_hash,signature,blockhash,expiry,state,created_at,generation,buy_quote,buy_amount_in,buy_min_out FROM official_launch_reservation WHERE id=1 AND generation=2').first();}
function sameIdentity(row,next){return row.mint===next.mint&&row.creator===next.creator&&row.metadata_hash===next.metadataHash;}
/** Finalized success registers the same identity. Uncertain, pending, processed, confirmed and timeout keep the reservation and do not rebuild. */
export async function recoverOfficialLaunch(db,observation={}){
 const row=await readOfficialLaunchReservation(db);
 if(!row)return {status:'empty',rebuilt:false};
 if(observation.signature!==undefined&&observation.signature!==row.signature)throw Error('Official launch observation belongs to a different stored attempt.');
 if(row.state==='registered')return {status:'registered',rebuilt:false,mint:row.mint};
 const status=observation.status??null,confirmation=observation.confirmationStatus??null,err=observation.err??null;
 if(confirmation==='finalized'&&!err&&observation.transactionFound===true){
  const changed=await db.prepare("UPDATE official_launch_reservation SET state='registered' WHERE id=1 AND generation=2 AND state='reserved' AND mint=? AND creator=? AND metadata_hash=? AND signature=? AND message_hash=? AND blockhash=? AND expiry=? AND buy_amount_in=? AND buy_min_out=?").bind(row.mint,row.creator,row.metadata_hash,row.signature,row.message_hash,row.blockhash,row.expiry,row.buy_amount_in,row.buy_min_out).run();
  const next=await readOfficialLaunchReservation(db);
  // An owner confirmation and scheduled reconciliation can both observe the same
  // finalized receipt. A zero-row CAS is safe only if that exact attempt won.
  const exact=next&&sameIdentity(next,{mint:row.mint,creator:row.creator,metadataHash:row.metadata_hash})&&next.signature===row.signature&&next.message_hash===row.message_hash&&next.blockhash===row.blockhash&&next.expiry===row.expiry;
  if(!exact||next.state!=='registered'||![0,1].includes(changes(changed)))throw Error('Official launch identity changed during recovery.');
  return {status:'registered',rebuilt:false,mint:row.mint};
 }
 const failedReady=(confirmation==='finalized'||status==='finalized')&&!!err&&observation.transactionFound===true&&observation.mintAccountExists===false&&Number.isSafeInteger(observation.finalizedHeight)&&observation.finalizedHeight>row.expiry;
 if(failedReady){
  const evidence=JSON.stringify({err,finalizedHeight:observation.finalizedHeight,transactionFound:true,mintAccountExists:false});
  await db.prepare("UPDATE official_launch_attempt SET outcome='finalized-failed', evidence=? WHERE signature=?").bind(evidence,row.signature).run();
  return {status:'failed-expired',rebuilt:false,renewAllowed:true,reason:'finalized-failure',mint:row.mint};
 }
 const uncertain=observation.timeout===true||['pending','processed','confirmed'].includes(status)||['processed','confirmed'].includes(confirmation)||(confirmation==='finalized'&&!!err);
 if(uncertain)return {status:'reserved',rebuilt:false,reason:'uncertain-submission',mint:row.mint};
 const expired=Number.isSafeInteger(observation.finalizedHeight)&&observation.finalizedHeight>row.expiry&&observation.mintAccountExists===false&&observation.transactionFound===false&&status==null&&confirmation==null&&err==null&&observation.timeout!==true;
 if(expired)return {status:'expired',rebuilt:false,renewAllowed:true,mint:row.mint};
 return {status:'reserved',rebuilt:false,reason:'not-expired',mint:row.mint};
}
/** A new blockhash may replace an expired attempt. Mint, creator and metadata hash may not. */
export async function renewExpiredOfficialLaunch(db,intent,observation={}){
 const gate=await recoverOfficialLaunch(db,observation);
 if((gate.status!=='expired'&&gate.status!=='failed-expired')||gate.renewAllowed!==true)throw Error('Official launch reservation cannot be rebuilt.');
 const row=await readOfficialLaunchReservation(db),next=complete(intent);
 if(gate.status==='failed-expired')await db.prepare("UPDATE official_launch_attempt SET outcome='finalized-failed' WHERE signature=? AND outcome!='registered'").bind(row.signature).run();
 if(next.mint!==row.mint||next.metadataHash!==row.metadata_hash||(row.buy_amount_in&&next.buyAmountIn!==row.buy_amount_in)||(row.buy_min_out&&next.buyMinOut!==row.buy_min_out))throw Error('Official launch identity is immutable.');
 if(next.creator!==row.creator)throw Error('Official launch wallet changed. Prepare again.');
 const changed=await db.prepare("UPDATE official_launch_reservation SET message_hash=?,signature=?,blockhash=?,expiry=? WHERE id=1 AND generation=2 AND state='reserved' AND mint=? AND creator=? AND metadata_hash=? AND buy_amount_in=? AND buy_min_out=?").bind(next.messageHash,next.signature,next.blockhash,next.expiry,row.mint,row.creator,row.metadata_hash,row.buy_amount_in,row.buy_min_out).run();
 if(changes(changed)!==1)throw Error('Official launch reservation changed during expiry renewal.');
 const saved=await readOfficialLaunchReservation(db);
 if(!sameIdentity(saved,next)||saved.signature!==next.signature||saved.message_hash!==next.messageHash)throw Error('Official launch renewal did not keep its identity.');
 return {...saved,rebuilt:true};
}
/** Drop a reserved row only after primary chain evidence says the mint is absent and the signature is dead.
 * The attempt row stays. A registered launch, a live mint, and a signature that might still land are refused. */
export async function releaseLostOfficialLaunchReservation(db,observation={}){
 const row=await readOfficialLaunchReservation(db);
 if(!row)throw Error('No official launch reservation.');
 if(row.state!=='reserved')throw Error('A registered official launch cannot be reset.');
 if(observation.signature!==undefined&&observation.signature!==row.signature)throw Error('Official launch observation belongs to a different stored attempt.');
 if(observation.mintAccountExists!==false)throw Error('The reserved mint exists on chain. The reservation was not reset.');
 const gate=await recoverOfficialLaunch(db,observation);
 const current=await readOfficialLaunchReservation(db);
 if(gate.status==='registered'||current?.state==='registered')throw Error('The stored signature finalized. The reservation was not reset.');
 if(gate.renewAllowed!==true||!current||current.state!=='reserved'||current.signature!==row.signature||current.mint!==row.mint||current.creator!==row.creator)throw Error('The stored signature may still land. The reservation was not reset.');
 await db.prepare("UPDATE official_launch_attempt SET outcome='released-lost-key' WHERE signature=? AND outcome!='registered'").bind(row.signature).run();
 const changed=await db.prepare("DELETE FROM official_launch_reservation WHERE id=1 AND generation=2 AND state='reserved' AND mint=? AND creator=? AND signature=?").bind(row.mint,row.creator,row.signature).run();
 if(changes(changed)!==1)throw Error('Official launch reservation changed during reset.');
 if(await readOfficialLaunchReservation(db))throw Error('Official launch reservation was not released.');
 return {released:true,mint:row.mint,signature:row.signature};
}
