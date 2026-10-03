import {reserveOfficialCreatorBuy,assertOfficialCreatorBuyReservation,bindOfficialCreatorBuyReservation} from './official-creator-buy-reservation.mjs';
import {loadSolTradeReview} from './sol-trade-intent.mjs';
import {assertOfficialCreatorBuyRequest} from './official-creator-buy.mjs';
import {LIGHTHOUSE_NET_GUARD_DEPLOYMENT_VERIFIED} from './sol-token-net-guard.mjs';
import {env} from 'cloudflare:workers';
import {bucket} from './server-utils';import {database} from './server-owner';
import {forwardRpc} from './server-rpc';import {createSimulationConnection} from './simulation-connection.mjs';
import {prepareGuardedSolTrade,solRouterFetcher} from './sol-trade-prepare.mjs';import {preflightSolTrade} from './sol-trade-preflight.mjs';import {verifySolTradeSubmission} from './sol-trade-relay.mjs';
import {grainpadPlatformId} from './platform-policy';import {NETWORKS} from './site-config';
import {resolveSolRouteScope,assertSolRouteScopeUnchanged} from './sol-route-scope.mjs';
// Operational review of the guarded route shape (reviewed on the GRAINU pilot); not Jupiter build certification.
const SOL_ROUTE_ABI_REVIEWED=true,SOL_ROUTE_NET_MINIMUM_REVIEWED=true;
export function assertSolTradeEnabled(){if(!SOL_ROUTE_ABI_REVIEWED||!SOL_ROUTE_NET_MINIMUM_REVIEWED||!LIGHTHOUSE_NET_GUARD_DEPLOYMENT_VERIFIED)throw Error('SOL routing remains disabled pending ABI and execution-net review.');if((env as unknown as {SOL_TRADING_ENABLED?:string}).SOL_TRADING_ENABLED!=='true')throw Error('SOL route preparation is under review. Direct wXMR trades remain available.');}
/** Optional official-router credential from Worker secrets; absent means unchanged keyless requests. */
export function routerFetcher(){return solRouterFetcher((env as unknown as {JUPITER_API_KEY?:string}).JUPITER_API_KEY);}
function connection(){return createSimulationConnection((body:Parameters<typeof forwardRpc>[1])=>forwardRpc('mainnet-beta',body,{lane:'trade',primaryOnly:true}));}
/** Registered Grainpad launch record for this platform, or null. */
async function findLaunch(mint:string){if(typeof mint!=='string')return null;const row=await database().prepare('SELECT record FROM launch_index WHERE network=? AND platform_id=? AND mint=?').bind('mainnet-beta',String(grainpadPlatformId()),mint).first<{record:string}>();return row?JSON.parse(row.record):null;}
/** Current verified route for a registered wXMR launch: its LaunchLab curve or its migrated Raydium CPMM pool. */
export async function resolveServerSolRouteScope(mint:string,rpc:ReturnType<typeof connection>=connection()){return resolveSolRouteScope(rpc,await findLaunch(mint),{mint,platformId:String(grainpadPlatformId())});}
/** Stored reviews stay executable only while their mint and pool are still the current verified route. */
function admitReview(rpc:ReturnType<typeof connection>){return async(review:{mint:string})=>assertSolRouteScopeUnchanged(review,await resolveServerSolRouteScope(review.mint,rpc));}
export async function prepareServerSolTrade(input:{owner:string;mint:string;side:string;amount:string;slippageBps:number;maxTotalDebitLamports:number;creatorBuy?:boolean}){
 assertSolTradeEnabled();
 if(input.creatorBuy!==undefined&&input.creatorBuy!==true)throw Error('Invalid creator-buy shortcut marker.');
 if(input.creatorBuy===true){const official=await database().prepare('SELECT mint FROM official_token WHERE id=1').first<{mint:string}>();assertOfficialCreatorBuyRequest(input,{publishedMint:official?.mint});}
 const actual=bucket();
 // Persist the server-verified marker in the immutable review, not a browser flag.
 const storage=input.creatorBuy===true?{get:actual.get.bind(actual),put:async(key:string,body:string,options:unknown)=>actual.put(key,JSON.stringify({...JSON.parse(body),officialCreatorBuy:true}),options as Parameters<typeof actual.put>[2])}:actual;
 const review=await prepareGuardedSolTrade({...input,fetcher:routerFetcher(),connection:connection(),storage,expectedGenesis:NETWORKS['mainnet-beta'].genesis,platformId:String(grainpadPlatformId()),findLaunch});
 return input.creatorBuy===true?reserveOfficialCreatorBuy(database(),{...review,officialCreatorBuy:true}):review;
}
/** Exact stored bytes only; returns a classified simulation result before any wallet request. */
export async function preflightServerSolTrade(id:string){assertSolTradeEnabled();if(typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id))throw Error('Invalid SOL review identity.');const rpc=connection();await assertOfficialCreatorBuyReservation(database(),await loadSolTradeReview(bucket(),id));return preflightSolTrade(bucket(),id,rpc,{admit:admitReview(rpc)});}
export async function verifyServerSolTrade(id:string,encoded:string,network:string,method:string){assertSolTradeEnabled();if(network!=='mainnet-beta'||method!=='sendTransaction')throw Error('SOL intent header only authorizes its signed mainnet submission.');const rpc=connection();await assertOfficialCreatorBuyReservation(database(),await loadSolTradeReview(bucket(),id));const result=await verifySolTradeSubmission(bucket(),id,encoded,rpc,{admit:admitReview(rpc)});await bindOfficialCreatorBuyReservation(database(),result.review,result.signature);return result;}

/** Fixed unsigned probes use a non-persistent sink, never the trade-intent bucket. */
export async function prepareUnsignedSolAcceptance(name:string){
 const {SOL_GUARD_ACCEPTANCE_CASES,prepareUnsignedGuardAcceptance}=await import('./sol-guard-acceptance.mjs');
 if(SOL_GUARD_ACCEPTANCE_CASES.includes(name))return prepareUnsignedGuardAcceptance(connection(),name,NETWORKS['mainnet-beta'].genesis);
 const negative=name==='admin-buy-net-reject';
 const {solAcceptanceInput,solAcceptanceSummary}=await import('./sol-acceptance-policy.mjs');
 const review=await prepareGuardedSolTrade({...solAcceptanceInput(negative?'admin-buy':name),fetcher:routerFetcher(),connection:connection(),storage:{put:async()=>true},expectedGenesis:NETWORKS['mainnet-beta'].genesis,platformId:String(grainpadPlatformId()),findLaunch});
 if(negative){const {probeUnsignedNetGuardFailure}=await import('./sol-negative-acceptance.mjs');return probeUnsignedNetGuardFailure(connection(),review);}
 return solAcceptanceSummary(review);
}
