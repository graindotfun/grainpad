import './browser-buffer.mjs';
import {publicPriorityPolicy} from './priority-fee.mjs';
import {Buffer} from 'buffer';
import {getAssociatedTokenAddressSync,unpackAccount,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {PublicKey} from '@solana/web3.js';
import {rpc,assertNetwork} from './launch';
import {NETWORKS} from './site-config';
import {grainpadPlatformId} from './platform-policy';
import {readMarket} from './market-core.mjs';
import {baseTokenProgram} from './transfer-tax.mjs';
import {prepareCurveTrade,parseUnits} from './trade-core.mjs';
export async function inspectTrade(mintAddress:string){
 (globalThis as unknown as {Buffer:typeof Buffer}).Buffer??=Buffer;
 const connection=rpc('mainnet-beta');await assertNetwork(connection,'mainnet-beta');
 const mint=new PublicKey(mintAddress),market=await readMarket(connection,mint,grainpadPlatformId());
 return {mint:mint.toBase58(),pool:market.poolId.toBase58(),route:market.route,quote:market.quote,rates:market.route==='cpmm'?{trade:market.cpData!.configInfo!.tradeFeeRate.toString(),creator:market.cpData!.enableCreatorFee?market.cpData!.configInfo!.creatorFeeRate.toString():'0'}:{protocol:market.config.tradeFeeRate.toString(),platform:market.platform.feeRate.toString(),creator:market.platform.creatorFeeRate.toString()}};
}
export async function prepareTrade(ownerAddress:string,mintAddress:string,side:'buy'|'sell',text:string,slippage:string){
 (globalThis as unknown as {Buffer:typeof Buffer}).Buffer??=Buffer;
 if(!/^\d+(\.\d{1,2})?$/.test(slippage))throw Error('Slippage must be between 0 and 20%, with at most two decimals.');
 const slippageBps=Math.round(Number(slippage)*100);
 const market=await readMarket(rpc('mainnet-beta'),new PublicKey(mintAddress),grainpadPlatformId());
 return {...await prepareCurveTrade({connection:rpc('mainnet-beta'),owner:new PublicKey(ownerAddress),mint:new PublicKey(mintAddress),platformId:grainpadPlatformId(),side,amount:parseUnits(text,side==='buy'?market.quote.decimals:6),slippageBps,expectedGenesis:NETWORKS['mainnet-beta'].genesis,priorityBounds:await publicPriorityPolicy()}),network:'mainnet-beta' as const};
}

export async function readTradeBalances(ownerAddress:string,mintAddress:string){
 const connection=rpc('mainnet-beta'),owner=new PublicKey(ownerAddress),mint=new PublicKey(mintAddress);
 await assertNetwork(connection,'mainnet-beta');const market=await readMarket(connection,mint,grainpadPlatformId()),quoteMint=new PublicKey(market.quote.mint);
 const tokenProgram=baseTokenProgram(market.pool),baseAta=getAssociatedTokenAddressSync(mint,owner,false,tokenProgram),quoteAta=getAssociatedTokenAddressSync(quoteMint,owner);
 const [sol,accounts]=await Promise.all([connection.getBalance(owner,'confirmed'),connection.getMultipleAccountsInfo([baseAta,quoteAta],'confirmed')]);
 return {owner:ownerAddress,base:(accounts[0]?unpackAccount(baseAta,accounts[0],tokenProgram).amount:0n).toString(),quote:market.quote.native?String(sol):(accounts[1]?unpackAccount(quoteAta,accounts[1],TOKEN_PROGRAM_ID).amount:0n).toString(),sol:String(sol),quoteSymbol:market.quote.symbol};
}
