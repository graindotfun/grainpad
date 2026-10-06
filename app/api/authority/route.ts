import {database} from '@/lib/server-owner';
import {sharedMarketCache} from '@/lib/server-cache';
import {chain} from '@/lib/server-rpc';
import {grainpadPlatformId} from '@/lib/platform-policy.mjs';
import {buildAuthorityLedger,ledgerAccountKeys,programDataAddress,WATCHED_PROGRAMS,MAINNET} from '@/lib/authority-ledger.mjs';

export const dynamic='force-dynamic';
type RpcAccount={owner:string;data:[string,string];lamports:number;executable:boolean}|null;
const MAX_CURVES=400;

/** Read-only: finalized account reads only. Curves come from Grainpad's launch index, which is
 * labelled on the page; the independent full discovery is `node scripts/watch-authorities.mjs`. */
async function refresh(){
 const call=(method:string,params:unknown[])=>chain('mainnet-beta',method,params);
 const genesis=await call('getGenesisHash',[]) as string;
 if(genesis!==MAINNET)return buildAuthorityLedger({genesis,accounts:{},curves:[],curveDiscovery:{source:'none',complete:false}});
 const epoch=await call('getEpochInfo',[{commitment:'finalized'}]) as {epoch:number;absoluteSlot:number};
 const rows=await database().prepare('SELECT mint,pool FROM launch_index WHERE network=? AND platform_id=? ORDER BY created_at ASC LIMIT ?').bind('mainnet-beta',String(grainpadPlatformId()),MAX_CURVES+1).all<{mint:string;pool:string}>();
 const curves=(rows.results??[]).slice(0,MAX_CURVES);
 const keys=ledgerAccountKeys(curves),accounts:Record<string,RpcAccount>={};let slot=0;
 for(let i=0;i<keys.length;i+=100){
  const chunk=keys.slice(i,i+100);
  const r=await call('getMultipleAccounts',[chunk,{encoding:'base64',commitment:'finalized',minContextSlot:epoch.absoluteSlot}]) as {context:{slot:number};value:RpcAccount[]};
  if(!Array.isArray(r?.value)||r.value.length!==chunk.length)throw Error('Incomplete account read.');
  slot=Math.max(slot,r.context.slot);chunk.forEach((k,n)=>{accounts[k]=r.value[n];});
 }
 const dataKeys=WATCHED_PROGRAMS.map(p=>({id:p.id,data:programDataAddress(accounts[p.id])}));
 const present=dataKeys.filter(d=>d.data) as {id:string;data:string}[],programData:Record<string,RpcAccount>={};
 if(present.length){
  const r=await call('getMultipleAccounts',[present.map(d=>d.data),{encoding:'base64',commitment:'finalized',minContextSlot:slot}]) as {context:{slot:number};value:RpcAccount[]};
  if(r?.value?.length===present.length)present.forEach((d,n)=>{programData[d.id]=r.value[n];});
 }
 return buildAuthorityLedger({genesis,epoch:epoch.epoch,slot,observedAt:Date.now(),source:'Grainpad server read, finalized commitment',accounts,programData,curves,
  curveDiscovery:{source:'Grainpad launch index (not an independent chain scan)',complete:(rows.results?.length??0)<=MAX_CURVES,count:curves.length}});
}

export async function GET(){try{
 const result=await sharedMarketCache(database(),'authority-ledger:v1',refresh,{ttl:120_000,maxStale:3_600_000});
 return Response.json({ledger:result.data,stale:result.stale,updatedAt:result.updatedAt},{headers:{'Cache-Control':'no-store'}});
}catch{
 // Declared and third-party items stay visible; every on-chain value is marked unavailable.
 return Response.json({error:'read-failed',ledger:buildAuthorityLedger({accounts:{},curves:[],curveDiscovery:{source:'none',complete:false}})},{status:503,headers:{'Cache-Control':'no-store'}});
}}
