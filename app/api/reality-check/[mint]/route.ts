import {PublicKey} from '@solana/web3.js';
import {readConnection} from '@/lib/server-chain-connection';
import {database} from '@/lib/server-owner';
import {grainpadPlatformId} from '@/lib/platform-policy';
import {NETWORKS} from '@/lib/site-config';
import {sameOrigin,limitedJSON,fail} from '@/lib/server-utils';
import {registeredProject} from '@/lib/server-project';
import {readMarket} from '@/lib/market-core.mjs';
import {exitScenarios} from '@/lib/reality-check.mjs';
import {consumeRequestBudget} from '@/lib/abuse-budget.mjs';
export async function POST(request:Request,{params}:{params:Promise<{mint:string}>}){try{
 sameOrigin(request);const {amount,slippage}=await limitedJSON(request,1000);
 if(typeof amount!=='string'||amount.length>30||typeof slippage!=='string'||slippage.length>5)return fail(Error('Enter a token amount and slippage.'),400);
 // Reject invalid amounts before any RPC; valid registered projects only.
 const {parseTokenUnits}=await import('@/lib/quote-assets.mjs');parseTokenUnits(amount,6);
 if(!/^(0|[1-9]\d?)(\.\d{1,2})?$/.test(slippage)||Number(slippage)>20)throw Error('Slippage must be between 0 and 20%.');
 const project=await registeredProject((await params).mint),db=database();
 if(!await consumeRequestBudget(db,`exit:ip:${request.headers.get('cf-connecting-ip')||'local'}`,6)||!await consumeRequestBudget(db,'exit:site',30))return fail(Error('Quote checks are busy. Please retry in a minute.'),429);
 const connection=readConnection();if(await connection.getGenesisHash()!==NETWORKS['mainnet-beta'].genesis)throw Error('Network mismatch.');
 const market=await readMarket(connection,new PublicKey(project.mint),grainpadPlatformId());
 const result=exitScenarios(market,project.mint,project.creator,amount,slippage),checkedAt=Date.now();
 return Response.json({...result,mint:project.mint,symbol:project.symbol,checkedAt,expiresAt:checkedAt+30000,networkCost:'Not included. Network fees and account rent are calculated in the simulated swap preview.',notice:'Each row is a separate sale against the same reserves. No transaction was prepared or sent. Actual execution requires a fresh simulated swap preview.'},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e,400);}}
