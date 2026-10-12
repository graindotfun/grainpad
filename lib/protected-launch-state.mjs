import {Buffer} from 'buffer';
import {PublicKey} from '@solana/web3.js';
import {sha256} from '@noble/hashes/sha256';
import {protectedProgramAddresses,protectedProgramCommitment} from './protected-launch-program.mjs';
const disc=name=>Buffer.from(sha256(Buffer.from('account:'+name))).subarray(0,8);
function reader(data,name){
 const b=Buffer.from(data);let at=8;if(!b.subarray(0,8).equals(disc(name)))throw Error('Protected account discriminator changed.');
 const bytes=n=>{if(at+n>b.length)throw Error('Truncated protected account.');const out=b.subarray(at,at+n);at+=n;return out;};
 return {bytes,pk:()=>new PublicKey(bytes(32)).toBase58(),u8:()=>bytes(1)[0],u16:()=>bytes(2).readUInt16LE(),u64:()=>String(bytes(8).readBigUInt64LE()),time:()=>{const n=bytes(8).readBigInt64LE();if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Invalid protected chain time.');return Number(n);},text:max=>{const n=bytes(4).readUInt32LE();if(n>max)throw Error('Protected metadata length changed.');return new TextDecoder('utf-8',{fatal:true}).decode(bytes(n));},bool:()=>{const n=bytes(1)[0];if(n>1)throw Error('Invalid protected boolean.');return Boolean(n);}};
}
export function decodeProtectedLaunch(data){
 const r=reader(data,'Launch'),creator=r.pk(),nonce=r.u64(),bump=r.u8(),mintBump=r.u8(),mint=r.pk(),quoteVault=r.pk();
 const terms={nonce:r.u64(),opensAt:r.time(),closesAt:r.time(),deadline:r.time(),capRaw:r.u64(),minimumTokenRaw:r.u64(),taxBps:r.u16(),metadataHash:r.bytes(32).toString('hex'),name:r.text(32),symbol:r.text(10),uri:r.text(200)};
 const snapshots=Array.from({length:4},()=>r.bytes(32).toString('hex')),commitment=r.bytes(32).toString('hex'),state=r.u8(),totalRaw=r.u64(),spentRaw=r.u64(),receivedRaw=r.u64();
 if(nonce!==terms.nonce||commitment!==protectedProgramCommitment(terms)||![0,1,2].includes(state)||BigInt(spentRaw)>BigInt(totalRaw)||state!==1&&(spentRaw!=='0'||receivedRaw!=='0'))throw Error('Protected escrow state is inconsistent.');
 return {creator,nonce,bump,mintBump,mint,quoteVault,terms,snapshots,commitment,state,totalRaw,spentRaw,receivedRaw};
}
export function decodeProtectedPosition(data){const r=reader(data,'Position');return {launch:r.pk(),beneficiary:r.pk(),creditRaw:r.u64(),quoteClaimed:r.bool(),tokenClaimed:r.bool(),pending:r.bool(),inputBeforeRaw:r.u64(),inputRaw:r.u64(),minimumRaw:r.u64(),inputSource:r.pk(),intermediate:r.pk(),beginIndex:r.u16()};}
export function protectedStatus(launch,position,now){
 if(!Number.isSafeInteger(now)||now<0)throw Error('Verified chain time required.');
 const total=BigInt(launch.totalRaw),credit=BigInt(position?.creditRaw||'0');if(credit>total)throw Error('Position exceeds aggregate credit.');
 const settled=launch.state===1,expired=launch.state===2,phase=settled?'settled':expired?'refundable':now<launch.terms.opensAt?'scheduled':now<launch.terms.closesAt?'funding':now<launch.terms.deadline?'ready':'expired';
 const share=amount=>total?String(BigInt(amount)*credit/total):'0';
 return {phase,canFund:phase==='funding',canSettle:phase==='ready'&&total>0n,canExpire:phase==='expired',quoteClaimRaw:position?.quoteClaimed?'0':expired?String(credit):settled?share(total-BigInt(launch.spentRaw)):'0',tokenClaimRaw:position?.tokenClaimed?'0':settled?share(launch.receivedRaw):'0',creditRaw:String(credit),quoteClaimed:position?.quoteClaimed||false,tokenClaimed:position?.tokenClaimed||false};
}
export async function readProtectedState(connection,{creator,nonce,owner=creator,programId,commitment='confirmed'}){
 const a=protectedProgramAddresses({creator,nonce,owner,programId}),rows=await connection.getMultipleAccountsInfo([a.launch,a.position],commitment);
 if(rows.length!==2||!rows[0]||!rows[0].owner.equals(a.program))throw Error('Verified protected escrow was not found.');
 const launch=decodeProtectedLaunch(rows[0].data);if(launch.creator!==String(a.creator)||launch.nonce!==String(nonce)||launch.mint!==String(a.mint)||launch.quoteVault!==String(a.quoteVault))throw Error('Protected PDA identity changed.');
 let position=null;if(rows[1]){if(!rows[1].owner.equals(a.program))throw Error('Protected position owner changed.');position=decodeProtectedPosition(rows[1].data);if(position.launch!==String(a.launch)||position.beneficiary!==String(a.owner)||position.pending)throw Error('Protected beneficiary state is invalid.');}
 // Sysvar Clock carries cluster time; the RPC transport already supports this read.
 const clock=await connection.getAccountInfo(new PublicKey('SysvarC1ock11111111111111111111111111111111'),commitment);
 if(!clock||String(clock.owner)!=='Sysvar1111111111111111111111111111111111111'||clock.data.length!==40)throw Error('Cluster clock is unavailable.');
 const n=clock.data.readBigInt64LE(32);if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Cluster clock is invalid.');
 return {launch,position,status:protectedStatus(launch,position,Number(n)),addresses:Object.fromEntries(Object.entries(a).map(([k,v])=>[k,String(v)])),chainTime:Number(n)};
}
