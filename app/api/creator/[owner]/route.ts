import {creatorFeeTotals} from '@/lib/event-history.mjs';
import {splitFeeHistory} from '@/lib/creator-earnings.mjs';
import {PublicKey} from '@solana/web3.js';import {database} from '@/lib/server-owner';import {grainpadPlatformId} from '@/lib/platform-policy';import {indexedLaunchPage} from '@/lib/launch-index.mjs';
import {identityCards} from '@/lib/wallet-identity.mjs';
export async function GET(request:Request,{params}:{params:Promise<{owner:string}>}){try{
 const owner=new PublicKey((await params).owner).toBase58(),db=database();
 const page=await indexedLaunchPage(db,'mainnet-beta',grainpadPlatformId().toBase58(),new URL(request.url).searchParams.get('cursor'),owner);
 let identity=null;try{identity=(await identityCards(db,[owner],{limit:1}))[owner]||null;}catch{identity=null;}
 const {creator:feeHistory,feeKey:feeKeyHistory}=splitFeeHistory(await creatorFeeTotals(database(),owner));
 return Response.json({...page,owner,identity,feeHistory,feeKeyHistory,feeCoverage:'All aggregated observed events; history may contain gaps. Curve claims use a shared creator vault and may include fees from non-grainpad launches.',coverage:'indexed launches only',earnings:{curve:{earned:null,claimed:null},cpmm:{earned:null,claimed:null}},creatorLpShare:0,notice:'Observed earned amounts come from creator-vault transfers; claimed amounts come from finalized claim transfers. Missing sources remain unknown. Live claimable balances are checked by the claim controls. Locked-LP Fee Key claims are platform fees and are listed separately; creators receive no graduation LP.'},{headers:{'Cache-Control':'no-store'}});
}catch{return Response.json({error:'Creator data unavailable.'},{status:503});}}
