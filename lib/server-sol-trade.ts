import {LIGHTHOUSE_NET_GUARD_DEPLOYMENT_VERIFIED} from './sol-token-net-guard.mjs';
import {env} from 'cloudflare:workers';
import {bucket} from './server-utils';import {database} from './server-owner';
import {forwardRpc} from './server-rpc';import {createSimulationConnection} from './simulation-connection.mjs';
import {prepareGuardedSolTrade} from './sol-trade-prepare.mjs';import {verifySolTradeSubmission} from './sol-trade-relay.mjs';
import {grainpadPlatformId} from './platform-policy';import {NETWORKS} from './site-config';
// Release gates remain code-level false until independent ABI and execution-net reviews close.
const SOL_ROUTE_ABI_REVIEWED=false,SOL_ROUTE_NET_MINIMUM_REVIEWED=false;
export function assertSolTradeEnabled(){if(!SOL_ROUTE_ABI_REVIEWED||!SOL_ROUTE_NET_MINIMUM_REVIEWED||!LIGHTHOUSE_NET_GUARD_DEPLOYMENT_VERIFIED)throw Error('SOL routing remains disabled pending ABI and execution-net review.');if((env as unknown as {SOL_TRADING_ENABLED?:string}).SOL_TRADING_ENABLED!=='true')throw Error('SOL route preparation is under review. Direct wXMR trades remain available.');}
function connection(){return createSimulationConnection((body:Parameters<typeof forwardRpc>[1])=>forwardRpc('mainnet-beta',body,{lane:'trade',primaryOnly:true}));}
export async function prepareServerSolTrade(input:{owner:string;mint:string;side:string;amount:string;slippageBps:number;maxTotalDebitLamports:number}){
 assertSolTradeEnabled();const db=database();return prepareGuardedSolTrade({...input,connection:connection(),storage:bucket(),expectedGenesis:NETWORKS['mainnet-beta'].genesis,findLaunch:async(mint:string)=>{const row=await db.prepare('SELECT record FROM launch_index WHERE network=? AND platform_id=? AND mint=?').bind('mainnet-beta',String(grainpadPlatformId()),mint).first<{record:string}>();return row?JSON.parse(row.record):null;}});
}
export async function verifyServerSolTrade(id:string,encoded:string,network:string,method:string){assertSolTradeEnabled();if(network!=='mainnet-beta'||method!=='sendTransaction')throw Error('SOL intent header only authorizes its signed mainnet submission.');return verifySolTradeSubmission(bucket(),id,encoded,connection());}

/** Fixed unsigned probes use a non-persistent sink, never the trade-intent bucket. */
export async function prepareUnsignedSolAcceptance(name:string){
 const {SOL_GUARD_ACCEPTANCE_CASES,prepareUnsignedGuardAcceptance}=await import('./sol-guard-acceptance.mjs');
 if(SOL_GUARD_ACCEPTANCE_CASES.includes(name))return prepareUnsignedGuardAcceptance(connection(),name,NETWORKS['mainnet-beta'].genesis);
 const negative=name==='admin-buy-net-reject';
 const {solAcceptanceInput,solAcceptanceSummary}=await import('./sol-acceptance-policy.mjs');const db=database();
 const review=await prepareGuardedSolTrade({...solAcceptanceInput(negative?'admin-buy':name),connection:connection(),storage:{put:async()=>true},expectedGenesis:NETWORKS['mainnet-beta'].genesis,findLaunch:async(mint:string)=>{const row=await db.prepare('SELECT record FROM launch_index WHERE network=? AND platform_id=? AND mint=?').bind('mainnet-beta',String(grainpadPlatformId()),mint).first<{record:string}>();return row?JSON.parse(row.record):null;}});
 if(negative){const {probeUnsignedNetGuardFailure}=await import('./sol-negative-acceptance.mjs');return probeUnsignedNetGuardFailure(connection(),review);}
 return solAcceptanceSummary(review);
}
