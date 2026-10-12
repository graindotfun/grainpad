/** Browser check of a server-built Protected Launch funding review. The values the contributor approves (currency,
 * exact input, conversion minimum, slippage and temporary rent) are read back from the unsigned bytes before any
 * wallet prompt; the server summary alone is never trusted. No RPC, wallet or submission. */
import {Buffer} from 'buffer';
import {VersionedTransaction,SystemProgram} from '@solana/web3.js';
import {sha256} from '@noble/hashes/sha256';
import {PROTECTED_FUNDING_ASSETS,protectedRaw} from './protected-launch-economics.mjs';
import {parseTokenUnits} from './quote-assets.mjs';
import {decodeRouteV2Steps,JUPITER_ROUTE_V2_DISCRIMINATOR} from './jupiter-route-v2.mjs';
const JUPITER='JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',SYSTEM=String(SystemProgram.programId);
const tag=name=>Buffer.from(sha256(Buffer.from('global:'+name))).subarray(0,8).toString('hex');
const TAGS=Object.freeze({deposit:tag('deposit'),begin:tag('begin_conversion'),converted:tag('deposit_converted')});
const refuse=reason=>{throw Error(`The prepared contribution differs from what you entered (${reason}). Nothing was signed.`);};
export function assertProtectedFundingReview(review,{owner,asset,amount,programId,slippageBps=100}){
 const s=review?.summary;
 if(s?.action!=='fund')return null;
 if(!Object.hasOwn(PROTECTED_FUNDING_ASSETS,asset)||typeof programId!=='string')refuse('funding asset or escrow program');
 const inputRaw=String(parseTokenUnits(amount,PROTECTED_FUNDING_ASSETS[asset].decimals));
 if(review.owner!==owner||s.asset!==asset||s.inputRaw!==inputRaw)refuse('currency or amount');
 const minimum=protectedRaw(String(s.minimumQuoteRaw),{positive:true}),estimate=protectedRaw(String(s.estimatedQuoteRaw),{positive:true});
 if(minimum>estimate)refuse('conversion minimum');
 const tx=VersionedTransaction.deserialize(Buffer.from(review.wire,'base64')),m=tx.message,keys=m.staticAccountKeys.map(String);
 if(keys[0]!==owner)refuse('fee payer');
 const ixs=m.compiledInstructions.map(ix=>({program:keys[ix.programIdIndex],data:Buffer.from(ix.data)}));
 const of=program=>ixs.filter(ix=>ix.program===program),escrow=of(programId),hex=ix=>ix.data.subarray(0,8).toString('hex');
 const u64=(ix,at)=>ix.data.readBigUInt64LE(at);
 if(asset==='wXMR'){
  // Direct deposit: one instruction, exact input, credited 1:1. No router, transfer or temporary account.
  if(escrow.length!==1||hex(escrow[0])!==TAGS.deposit||u64(escrow[0],8)!==BigInt(inputRaw)||minimum!==BigInt(inputRaw)||of(JUPITER).length||of(SYSTEM).length||m.header.numRequiredSignatures!==1||review.requiredLocalSigners.length)refuse('direct wXMR deposit');
  return {asset,inputRaw,minimumQuoteRaw:String(minimum),estimatedQuoteRaw:String(estimate),temporaryRentLamports:'0'};
 }
 const begin=escrow.filter(ix=>hex(ix)===TAGS.begin),converted=escrow.filter(ix=>hex(ix)===TAGS.converted);
 if(escrow.length!==2||begin.length!==1||converted.length!==1||!begin[0].data.subarray(8).equals(converted[0].data.subarray(8)))refuse('escrow conversion bracket');
 for(const ix of [begin[0],converted[0]])if(u64(ix,8)!==BigInt(inputRaw)||u64(ix,16)!==minimum)refuse('escrow conversion amounts');
 if(ixs.indexOf(begin[0])>=ixs.findIndex(ix=>ix.program===JUPITER)||ixs.findIndex(ix=>ix.program===JUPITER)>=ixs.indexOf(converted[0]))refuse('swap outside the escrow bracket');
 const routes=of(JUPITER);
 if(routes.length!==1||routes[0].data.subarray(0,8).toString('hex')!==JUPITER_ROUTE_V2_DISCRIMINATOR||u64(routes[0],8)!==BigInt(inputRaw)||routes[0].data.readUInt16LE(24)!==slippageBps)refuse('conversion route');
 const steps=decodeRouteV2Steps(routes[0].data);
 if(steps.length!==(asset==='SOL'?1:2)||steps.some(step=>step.name!=='RaydiumClmm'))refuse('conversion venues');
 // System: two temporary account creations (rent returned on close) and, for SOL, one exact transfer of the input.
 const system=of(SYSTEM),creates=system.filter(ix=>ix.data.readUInt32LE(0)===0),transfers=system.filter(ix=>ix.data.readUInt32LE(0)===2);
 const rent=BigInt(String(s.temporaryRentLamports||'0'));
 if(creates.length!==2||creates.some(ix=>u64(ix,4)*2n!==rent)||creates.length+transfers.length!==system.length)refuse('temporary accounts');
 if(asset==='SOL'?transfers.length!==1||u64(transfers[0],4)!==BigInt(inputRaw):transfers.length!==0)refuse('SOL input transfer');
 if(m.header.numRequiredSignatures!==3||review.requiredLocalSigners.length!==2)refuse('signers');
 return {asset,inputRaw,minimumQuoteRaw:String(minimum),estimatedQuoteRaw:String(estimate),temporaryRentLamports:String(rent)};
}
