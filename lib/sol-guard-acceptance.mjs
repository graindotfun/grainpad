/** Fixed unsigned behavioral probes. This module cannot sign, persist or submit. */
import {PublicKey,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import {Buffer} from 'buffer';
import {TOKEN_2022_PROGRAM_ID,getAssociatedTokenAddressSync,unpackAccount} from '@solana/spl-token';
import {netTokenMinimumGuard,tokenBalanceEqualityGuard,LIGHTHOUSE_NET_GUARD_PROGRAM} from './sol-token-net-guard.mjs';
export const SOL_GUARD_ACCEPTANCE_CASES=Object.freeze(['guard-equal-pass','guard-minimum-pass','guard-equal-fail','guard-minimum-fail']);
const owner=new PublicKey('B4GixWMzVF5fDRKebbS87oYcoFoERmQB182rNBVk9tXx'),mint=new PublicKey('FGrHB6tEqXNfMBXZ4xNoa6hKwjWCjjxwijeB5uKLvgrn'),ata=new PublicKey('6kguZKoRpgijggp85Dy9nG3PJjpfG9oepzDjxHLwjEAA');
const U64_MAX=18446744073709551615n;
export async function prepareUnsignedGuardAcceptance(connection,name,expectedGenesis){
 if(!SOL_GUARD_ACCEPTANCE_CASES.includes(name))throw Error('Unsupported unsigned guard case.');
 if(await connection.getGenesisHash()!==expectedGenesis)throw Error('Wrong guard probe network.');
 if(!getAssociatedTokenAddressSync(mint,owner,false,TOKEN_2022_PROGRAM_ID).equals(ata))throw Error('Guard probe ATA binding mismatch.');
 const snapshot=await connection.getAccountInfoAndContext(ata,'confirmed');
 if(!Number.isSafeInteger(snapshot.context?.slot)||snapshot.context.slot<1||!snapshot.value||snapshot.value.executable||!snapshot.value.owner.equals(TOKEN_2022_PROGRAM_ID))throw Error('Guard token snapshot unavailable.');
 const token=unpackAccount(ata,snapshot.value,TOKEN_2022_PROGRAM_ID);
 if(!token.owner.equals(owner)||!token.mint.equals(mint)||!token.isInitialized||token.isFrozen)throw Error('Guard token identity unavailable.');
 const baseline=token.amount,expectedFailure=name.endsWith('-fail');
 if(baseline<1n||baseline===U64_MAX)throw Error('Guard probe requires a positive incrementable token balance.');
 const threshold=String(baseline+(expectedFailure?1n:0n));
 const instruction=name.includes('-equal-')?tokenBalanceEqualityGuard(ata,threshold):netTokenMinimumGuard(ata,threshold);
 const latest=await connection.getLatestBlockhashAndContext('confirmed');
 if(!Number.isSafeInteger(latest.context?.slot)||latest.context.slot<1)throw Error('Guard probe blockhash context unavailable.');
 const tx=new VersionedTransaction(new TransactionMessage({payerKey:owner,recentBlockhash:latest.value.blockhash,instructions:[instruction]}).compileToV0Message());
 if(tx.message.header.numRequiredSignatures!==1||tx.signatures.length!==1||tx.signatures[0].some(Boolean)||tx.serialize().length>1232)throw Error('Guard probe is not an unsigned bounded transaction.');
 const sim=await connection.simulateTransaction(tx,{sigVerify:false,commitment:'confirmed',minContextSlot:Math.max(snapshot.context.slot,latest.context.slot),accounts:{encoding:'base64',addresses:[String(ata)]}});
 if(!Number.isSafeInteger(sim.context?.slot)||sim.context.slot<Math.max(snapshot.context.slot,latest.context.slot))throw Error('Guard simulation context unavailable.');
 const logs=sim.value?.logs;
 if(!Array.isArray(logs)||!logs.includes(`Program ${LIGHTHOUSE_NET_GUARD_PROGRAM} invoke [1]`))throw Error('Lighthouse execution was not observed.');
 if(expectedFailure){
  // Pinned single-assertion ABI: AssertionFailed=6001 (0x1771); no other failure is evidence.
  if(JSON.stringify(sim.value.err)!==JSON.stringify({InstructionError:[0,{Custom:6001}]})||!logs.includes(`Program ${LIGHTHOUSE_NET_GUARD_PROGRAM} failed: custom program error: 0x1771`))throw Error('Expected Lighthouse assertion rejection was not observed.');
 }else{
  if(sim.value.err!==null||!logs.includes(`Program ${LIGHTHOUSE_NET_GUARD_PROGRAM} success`))throw Error('Lighthouse positive assertion did not succeed.');
  const post=sim.value.accounts?.[0];
  if(!post||post.owner!==String(TOKEN_2022_PROGRAM_ID)||!Array.isArray(post.data)||post.data[1]!=='base64')throw Error('Guard post-state unavailable.');
  const bytes=Buffer.from(post.data[0],'base64');
  if(bytes.length<165||!bytes.subarray(0,32).equals(mint.toBuffer())||!bytes.subarray(32,64).equals(owner.toBuffer())||bytes.readBigUInt64LE(64)!==baseline)throw Error('Guard probe token snapshot changed.');
 }
 return {case:name,executionEnabled:false,signed:false,submitted:false,observedExpectedResult:true,expectedFailure,program:LIGHTHOUSE_NET_GUARD_PROGRAM,owner:String(owner),mint:String(mint),account:String(ata),snapshotSlot:snapshot.context.slot,simulationSlot:sim.context.slot,spendableAmount:String(baseline),assertionAmount:threshold,assertion:name.includes('-equal-')?'equal':'greater-than-or-equal',error:sim.value.err,logs:logs.slice(0,20),packetBytes:tx.serialize().length};
}
