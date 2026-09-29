import './browser-buffer.mjs';
import {Buffer} from 'buffer';
import {PublicKey} from '@solana/web3.js';
import {graduatedClaimInstructions} from './graduated-fee-instructions.mjs';
import {rpc,assertNetwork} from './launch';
import {grainpadPlatformId} from './platform-policy';
import {prepareInstructions} from './operations';
export async function prepareGraduatedClaim(ownerAddress:string,mintAddress:string,kind:'creator'|'lp',feeKey:string,maxCost:string){
 (globalThis as unknown as {Buffer:typeof Buffer}).Buffer??=Buffer;
 const {readMarket}=await import('./market-core.mjs');
 const connection=rpc('mainnet-beta');await assertNetwork(connection,'mainnet-beta');
 const owner=new PublicKey(ownerAddress),mint=new PublicKey(mintAddress),market=await readMarket(connection,mint,grainpadPlatformId());
 if(market.route!=='cpmm'||!market.cpData)throw Error('This token has not graduated to CPMM. Use the curve fee claim above.');
 const {instructions,p,ataA,ataB}=await graduatedClaimInstructions(connection,market,owner,kind,feeKey);
 const prepared=await prepareInstructions(ownerAddress,instructions,maxCost);
 const [before,sim]=await Promise.all([connection.getMultipleAccountsInfo([ataA,ataB]),connection.simulateTransaction(prepared.transaction,{sigVerify:false,commitment:'confirmed',accounts:{encoding:'base64',addresses:[ataA.toBase58(),ataB.toBase58()]}})]);
 if(sim.value.err)throw Error('Fee estimate changed. Prepare again.');
 const received=[p.mintA,p.mintB].map((mint,index)=>{const old=before[index]?.data.readBigUInt64LE(64)||0n,after=sim.value.accounts?.[index];if(!after)throw Error('Unable to verify fee destination.');const amount=Buffer.from(after.data[0],'base64').readBigUInt64LE(64)-old;return {mint:mint.toBase58(),amount:amount.toString(),decimals:index===0?p.mintDecimalA:p.mintDecimalB};});
 if(received.every(x=>BigInt(x.amount)<=0n))throw Error('No claimable fees currently.');
 return {...prepared,kind,received,quoteAsset:market.quote,pool:market.poolId.toBase58()};
}
