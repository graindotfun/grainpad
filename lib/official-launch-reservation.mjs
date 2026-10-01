import {Buffer} from 'buffer';
import {submittedSignature} from './rpc-submissions.mjs';
import {metadataHashFromUri,contentHash} from './metadata-publication.mjs';
const hex=/^[a-f0-9]{64}$/;
const changes=result=>result?.meta?.changes??result?.changes;
/** Called only after the official pins and the exact message have been checked. Signed bytes never enter storage. */
export async function officialLaunchIntent(tx,launch,expiry){
 const signature=submittedSignature(Buffer.from(tx.serialize()).toString('base64'));
 if(!Number.isSafeInteger(expiry)||expiry<1)throw Error('Official launch expiry is missing.');
 return {mint:launch.mint,creator:String(tx.message.staticAccountKeys[0]),metadataHash:metadataHashFromUri(launch.uri,'https://grainpad.fun'),messageHash:await contentHash(tx.message.serialize()),signature,blockhash:tx.message.recentBlockhash,expiry};
}
function complete(intent){
 const {mint,creator,metadataHash,messageHash,signature,blockhash,expiry}=intent??{};
 if(!mint||!creator||!signature||!blockhash||!hex.test(metadataHash)||!hex.test(messageHash)||!Number.isSafeInteger(expiry)||expiry<1)throw Error('Incomplete official launch intent.');
 return {mint,creator,metadataHash,messageHash,signature,blockhash,expiry};
}
/** A singleton protects the one official launch. The same intent is idempotent. A different identity conflicts. */
export async function reserveOfficialLaunch(db,intent){
 const next=complete(intent);
 await db.prepare('INSERT INTO official_launch_reservation (id,mint,creator,metadata_hash,message_hash,signature,blockhash,expiry,state,created_at) VALUES (1,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(next.mint,next.creator,next.metadataHash,next.messageHash,next.signature,next.blockhash,next.expiry,'reserved',Date.now()).run();
 const row=await readOfficialLaunchReservation(db);
 if(!row)throw Error('Official launch reservation was not recorded.');
 if(row.state==='registered')throw Error('Official GRAIN has already launched. A second launch is not reserved.');
 if(row.mint!==next.mint||row.creator!==next.creator||row.metadata_hash!==next.metadataHash)throw Error('A different official launch identity is already reserved.');
 if(row.message_hash!==next.messageHash||row.signature!==next.signature||row.blockhash!==next.blockhash||row.expiry!==next.expiry)throw Error('A different official launch intent is already reserved. Reconcile its signature before any new review.');
 return row;
}
export async function readOfficialLaunchReservation(db){return db.prepare('SELECT mint,creator,metadata_hash,message_hash,signature,blockhash,expiry,state,created_at FROM official_launch_reservation WHERE id=1').first();}
function sameIdentity(row,next){return row.mint===next.mint&&row.creator===next.creator&&row.metadata_hash===next.metadataHash;}
/** Finalized success registers the same identity. Uncertain, pending, processed, confirmed and timeout keep the reservation and do not rebuild. */
export async function recoverOfficialLaunch(db,observation={}){
 const row=await readOfficialLaunchReservation(db);
 if(!row)return {status:'empty',rebuilt:false};
 if(row.state==='registered')return {status:'registered',rebuilt:false,mint:row.mint};
 const status=observation.status??null,confirmation=observation.confirmationStatus??null,err=observation.err??null;
 if(confirmation==='finalized'&&!err&&observation.transactionFound===true){
  const changed=await db.prepare("UPDATE official_launch_reservation SET state='registered' WHERE id=1 AND state='reserved' AND mint=? AND creator=? AND metadata_hash=?").bind(row.mint,row.creator,row.metadata_hash).run();
  if(changes(changed)!==1)throw Error('Official launch reservation changed during recovery.');
  const next=await readOfficialLaunchReservation(db);
  if(!sameIdentity(next,{mint:row.mint,creator:row.creator,metadataHash:row.metadata_hash})||next.state!=='registered')throw Error('Official launch identity changed during recovery.');
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
 if(next.mint!==row.mint||next.metadataHash!==row.metadata_hash)throw Error('Official launch identity is immutable.');
 if(next.creator!==row.creator)throw Error('Official launch wallet changed. Prepare again.');
 const changed=await db.prepare("UPDATE official_launch_reservation SET message_hash=?,signature=?,blockhash=?,expiry=? WHERE id=1 AND state='reserved' AND mint=? AND creator=? AND metadata_hash=?").bind(next.messageHash,next.signature,next.blockhash,next.expiry,row.mint,row.creator,row.metadata_hash).run();
 if(changes(changed)!==1)throw Error('Official launch reservation changed during expiry renewal.');
 const saved=await readOfficialLaunchReservation(db);
 if(!sameIdentity(saved,next)||saved.signature!==next.signature||saved.message_hash!==next.messageHash)throw Error('Official launch renewal did not keep its identity.');
 return {...saved,rebuilt:true};
}
