import './browser-buffer.mjs';
import {Buffer} from 'buffer';
import {PublicKey} from '@solana/web3.js';
import {NATIVE_MINT,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {LaunchpadPool,LaunchpadConfig,PlatformConfig,getPdaLaunchpadPoolId,LAUNCHPAD_PROGRAM,CpmmPoolInfoLayout,CpmmConfigInfoLayout,CREATE_CPMM_POOL_PROGRAM} from '@raydium-io/raydium-sdk-v2';
import {QUOTES} from './quote-assets.mjs';
import {cpmmId} from './market-core.mjs';
/** One getMultipleAccounts refresh for a curve market, shared by all viewers. */
export async function readMarketSnapshot(call,mintAddress,platformAddress,configAddress){
 const quote=Object.values(QUOTES).find(q=>q.config===configAddress);if(!quote)throw Error('Unsupported quote configuration.');const quoteMint=new PublicKey(quote.mint);
 const mint=new PublicKey(mintAddress),platformId=new PublicKey(platformAddress),configId=new PublicKey(configAddress);
 const launchPool=getPdaLaunchpadPoolId(LAUNCHPAD_PROGRAM,mint,quoteMint).publicKey;
 const response=await call('getMultipleAccounts',[[launchPool.toBase58(),configAddress,platformAddress,mintAddress],{encoding:'base64',commitment:'confirmed'}]);
 const [pa,ca,fa,ma]=response.value;
 if(!pa||pa.owner!==LAUNCHPAD_PROGRAM.toBase58())throw Error('Grainpad launch pool not found.');
 if(!ca||!fa||ca.owner!==pa.owner||fa.owner!==pa.owner||ma?.owner!==TOKEN_PROGRAM_ID.toBase58())throw Error('Invalid market configuration.');
 const pool=LaunchpadPool.decode(Buffer.from(pa.data[0],'base64')),config=LaunchpadConfig.decode(Buffer.from(ca.data[0],'base64')),platform=PlatformConfig.decode(Buffer.from(fa.data[0],'base64'));
 if(!pool.mintA.equals(mint)||!pool.mintB.equals(quoteMint)||!pool.platformId.equals(platformId)||!pool.configId.equals(configId)||pool.mintProgramFlag!==0)throw Error('This pool was not launched via Grainpad.');
 if(![0,1,2].includes(pool.status))throw Error('Unsupported market state.');
 const activityObserved=pool.status!==0||[pool.realA,pool.realB,pool.protocolFee,pool.platformFee].some(n=>!n.isZero());
 let route=pool.status===0?'curve':'graduating',address=launchPool.toBase58();
 let rates={protocol:config.tradeFeeRate.toString(),platform:platform.feeRate.toString(),creator:platform.creatorFeeRate.toString()};
 if(pool.status===2){
  const id=cpmmId(mint,platform.cpConfigId,quoteMint);
  const {value:[cp,cc]}=await call('getMultipleAccounts',[[id.toBase58(),platform.cpConfigId.toBase58()],{encoding:'base64',commitment:'confirmed'}]);
  if(cp){
   if(cp.owner!==CREATE_CPMM_POOL_PROGRAM.toBase58()||cc?.owner!==cp.owner)throw Error('Invalid graduated pool owner.');
   const p=CpmmPoolInfoLayout.decode(Buffer.from(cp.data[0],'base64')),c=CpmmConfigInfoLayout.decode(Buffer.from(cc.data[0],'base64'));
   if(!p.configId.equals(platform.cpConfigId)||![p.mintA.toBase58(),p.mintB.toBase58()].includes(mintAddress)||![p.mintA.toBase58(),p.mintB.toBase58()].includes(quote.mint)||!p.mintProgramA.equals(TOKEN_PROGRAM_ID)||!p.mintProgramB.equals(TOKEN_PROGRAM_ID))throw Error('Invalid graduated pool identity.');
   route='cpmm';address=id.toBase58();rates={trade:c.tradeFeeRate.toString(),creator:p.enableCreatorFee?c.creatorFeeRate.toString():'0'};
  }
 }
 return {quote,mint:mintAddress,pool:address,launchPool:launchPool.toBase58(),route,rates,activityObserved,slot:response.context.slot};
}
