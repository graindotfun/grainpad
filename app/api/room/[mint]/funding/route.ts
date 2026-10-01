import {database} from '@/lib/server-owner';
import {registeredProject} from '@/lib/server-project';
import {crewTasks} from '@/lib/launch-room.mjs';
import {consumeRequestBudget} from '@/lib/abuse-budget.mjs';
import {requestClientKey} from '@/lib/client-key.mjs';
import {lamportBalance,tokenBalance,fundingAssets,fundingBalance,taskCoverage,publicCoverage} from '@/lib/room-funding.mjs';
import {chain} from '@/lib/server-rpc';
import {sharedMarketCache} from '@/lib/server-cache';
import {NETWORKS} from '@/lib/site-config';
import {fail} from '@/lib/server-utils';
export const dynamic='force-dynamic';
type Asset={code:string;mint:string|null;decimals:number};
/** Read-only wallet-balance coverage of each open task budget. Not escrow: nothing is locked, held or moved.
 * Balances come from the shared RPC pipeline for the project's on-chain creator wallet only. A failure returns no coverage. */
export async function GET(request:Request,{params}:{params:Promise<{mint:string}>}){try{
 const project=await registeredProject((await params).mint),db=database();
 if(!await consumeRequestBudget(db,`funding:ip:${requestClientKey(request)}`,30))return Response.json({checkedAt:null,tasks:{}},{status:429,headers:{'Cache-Control':'no-store'}});
 const tasks=await crewTasks(db,project.mint),assets=fundingAssets(tasks,project.mint) as Asset[];
 const balances:Record<string,{raw:string;decimals:number;checkedAt:number}>={};
 if(assets.length){
  try{
   const genesis=await sharedMarketCache(db,'mainnet-genesis',()=>chain('mainnet-beta','getGenesisHash'),{ttl:86_400_000,maxStale:86_400_000});
   if(genesis.data!==NETWORKS['mainnet-beta'].genesis)throw Error('Network mismatch.');
   await Promise.all(assets.map(async asset=>{
    const key=asset.code===project.mint?project.mint:asset.code;
    try{
     const read=await fundingBalance(db,{creator:project.creator,key,asset},async()=>asset.mint===null
       ?lamportBalance(await chain('mainnet-beta','getBalance',[project.creator,{commitment:'finalized'}]))
       :tokenBalance(await chain('mainnet-beta','getTokenAccountsByOwner',[project.creator,{mint:asset.mint},{encoding:'jsonParsed',commitment:'finalized'}]),asset as {mint:string;decimals:number}),
      async()=>await consumeRequestBudget(db,`funding:refresh:${project.creator}:${key}`,1,{windowMs:15_000})&&await consumeRequestBudget(db,'funding:site',600,{windowMs:3_600_000}));
     if(read)balances[key]={raw:read.raw,decimals:read.decimals,checkedAt:read.checkedAt};
    }catch{/* no result for this asset: never Funded */}
   }));
  }catch{/* lookup unavailable: Rooms is unaffected */}
 }
 const out:Record<string,unknown>={};
 for(const task of tasks){const c=publicCoverage(taskCoverage(task,project.mint,balances));if(c)out[task.id]=c;}
 return Response.json({checkedAt:Date.now(),tasks:out},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e,400);}}
