import {curveDisplayStats} from './curve-display.mjs';
import {cpmmDisplayStats,cpmmNetReserves,curveLiquidityQuote,mintSupplyAmount,splTokenAmount} from './native-market.mjs';
import './browser-buffer.mjs';
import {Buffer} from 'buffer';
import {PublicKey} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {inspectRewardMint} from './rewards-snapshot.mjs';
import {baseTokenProgram,activeTransferFee} from './transfer-tax.mjs';
import {CPMM_CONFIG} from './launch-instructions.mjs';
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
 if(!ca||!fa||ca.owner!==pa.owner||fa.owner!==pa.owner||!ma)throw Error('Invalid market configuration.');
 const pool=LaunchpadPool.decode(Buffer.from(pa.data[0],'base64')),config=LaunchpadConfig.decode(Buffer.from(ca.data[0],'base64')),platform=PlatformConfig.decode(Buffer.from(fa.data[0],'base64'));
 if(!pool.mintA.equals(mint)||!pool.mintB.equals(quoteMint)||!pool.platformId.equals(platformId)||!pool.configId.equals(configId)||![0,1].includes(pool.mintProgramFlag))throw Error('This pool was not launched via Grainpad.');
 const tokenProgram=baseTokenProgram(pool);
 if(ma.owner!==String(tokenProgram))throw Error('Invalid base token program.');
 let transferTaxBps=0;
 if(pool.mintProgramFlag===1){
  if(quote.symbol!=='wXMR'||pool.mintDecimalsA!==6||pool.mintDecimalsB!==12||config.curveType!==0||!config.mintB.equals(quoteMint)||String(platform.cpConfigId)!==CPMM_CONFIG)throw Error('Invalid rewards market configuration.');
  const {fee}=inspectRewardMint(mint,{...ma,owner:tokenProgram,data:Buffer.from(ma.data[0],'base64')},platform.transferFeeExtensionAuth);
  const clock=await call('getEpochInfo',[{commitment:'confirmed',minContextSlot:response.context.slot}]);
  transferTaxBps=activeTransferFee(fee,clock.epoch).transferFeeBasisPoints;
 }
 if(![0,1,2].includes(pool.status))throw Error('Unsupported market state.');
 const activityObserved=pool.status!==0||[pool.realA,pool.realB,pool.protocolFee,pool.platformFee].some(n=>!n.isZero());
 let route=pool.status===0?'curve':'graduating',address=launchPool.toBase58(),cpmmStats=null;
 let rates={protocol:config.tradeFeeRate.toString(),platform:platform.feeRate.toString(),creator:platform.creatorFeeRate.toString()};
 if(pool.status===2){
  const id=cpmmId(mint,platform.cpConfigId,quoteMint);
  const {value:[cp,cc]}=await call('getMultipleAccounts',[[id.toBase58(),platform.cpConfigId.toBase58()],{encoding:'base64',commitment:'confirmed'}]);
  if(cp){
   if(cp.owner!==CREATE_CPMM_POOL_PROGRAM.toBase58()||cc?.owner!==cp.owner)throw Error('Invalid graduated pool owner.');
   const p=CpmmPoolInfoLayout.decode(Buffer.from(cp.data[0],'base64')),c=CpmmConfigInfoLayout.decode(Buffer.from(cc.data[0],'base64'));
   if(!p.configId.equals(platform.cpConfigId)||![p.mintA.toBase58(),p.mintB.toBase58()].includes(mintAddress)||![p.mintA.toBase58(),p.mintB.toBase58()].includes(quote.mint)||!p.mintProgramA.equals(p.mintA.equals(mint)?tokenProgram:TOKEN_PROGRAM_ID)||!p.mintProgramB.equals(p.mintB.equals(mint)?tokenProgram:TOKEN_PROGRAM_ID))throw Error('Invalid graduated pool identity.');
   route='cpmm';address=id.toBase58();rates={trade:c.tradeFeeRate.toString(),creator:p.enableCreatorFee?c.creatorFeeRate.toString():'0'};
   const vaults=await call('getMultipleAccounts',[[p.vaultA.toBase58(),p.vaultB.toBase58()],{encoding:'base64',commitment:'confirmed'}]);
   const [vaultA,vaultB]=vaults.value||[];
   const amount=(account,expectedMint,program)=>{
    if(!account||account.owner!==program)throw Error('Graduated vault is unavailable.');
    const data=Buffer.from(account.data[0],'base64');
    if(!Buffer.from(data.subarray(0,32)).equals(expectedMint.toBuffer()))throw Error('Graduated vault mint mismatch.');
    const value=splTokenAmount(data);if(value===null)throw Error('Graduated vault is unavailable.');return value;
   };
   const net=cpmmNetReserves(amount(vaultA,p.mintA,p.mintProgramA.toBase58()),amount(vaultB,p.mintB,p.mintProgramB.toBase58()),{protocolA:p.protocolFeesMintA.toString(),fundA:p.fundFeesMintA.toString(),creatorA:p.creatorFeesMintA.toString(),protocolB:p.protocolFeesMintB.toString(),fundB:p.fundFeesMintB.toString(),creatorB:p.creatorFeesMintB.toString()});
   const supply=ma?.data?.[0]?mintSupplyAmount(Buffer.from(ma.data[0],'base64')):null;
   cpmmStats=cpmmDisplayStats({mintA:p.mintA.toBase58(),mintB:p.mintB.toBase58(),tokenMint:mintAddress,quoteMint:quote.mint,reserveA:net.reserveA,reserveB:net.reserveB,decimalsA:p.mintDecimalA,decimalsB:p.mintDecimalB,supply});
  }
 }
 const curveStats=route==='curve'?curveDisplayStats(pool,pool.mintDecimalsA,pool.mintDecimalsB):null;
 const liquidity=route==='cpmm'?{quote:cpmmStats?.liquidity??null,kind:cpmmStats?'cpmm-reserves-at-spot':null}:{quote:curveLiquidityQuote(pool.realB.toString(),quote.decimals),kind:'curve-quote-raised'};
 return {transferTaxBps,quoteStats:route==='cpmm'?cpmmStats&&{price:cpmmStats.price,marketCap:cpmmStats.marketCap}:curveStats,liquidity,progress:{raised:pool.realB.toString(),target:pool.totalFundRaisingB.toString()},quote,mint:mintAddress,pool:address,launchPool:launchPool.toBase58(),route,rates,activityObserved,slot:response.context.slot};
}
