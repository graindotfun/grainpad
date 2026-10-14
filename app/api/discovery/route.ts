import {ROBINHOOD_MAINNET_FACTORY_ADDRESS} from '@/lib/chain/robinhood-mainnet.ts';
import {database} from '@/lib/server-owner';
import {grainpadPlatformId} from '@/lib/platform-policy';
import {discoveryRecords,enrichDiscovery} from '@/lib/token-discovery';
import {queryDiscovery} from '@/lib/discovery-index.mjs';
import {identityCards} from '@/lib/wallet-identity.mjs';
import {waitUntil} from 'cloudflare:workers';
import {refreshDiscoveryMarkets} from '@/lib/discovery-refresh.mjs';
import {serverMarket} from '@/lib/server-market';
import {backfillEventTimes} from '@/lib/launch-time-backfill.mjs';
import {chain as solanaChain} from '@/lib/server-rpc';
import {isChainFilter} from '@/lib/chain-display';
import {bucket} from '@/lib/server-utils';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const headers={'Cache-Control':'no-store'},params=new URL(request.url).searchParams;
 const search=params.get('q')||'',filter=params.get('filter')||'all',sort=params.get('sort')||'newest',page=Number(params.get('page')||1),quote=params.get('quote')||'all',chain=params.get('chain')||'all';
 if(!['all','SOL','wXMR'].includes(quote)||!isChainFilter(chain)||search.length>128||!['all','new','near','graduated'].includes(filter)||!['newest','oldest','market-cap','volume'].includes(sort)||!Number.isSafeInteger(page)||page<1)return Response.json({error:'Invalid directory request.'},{status:400,headers});
 try{
  const platform=grainpadPlatformId().toBase58(),now=Date.now(),result=await queryDiscovery(database(),{platform,search,filter,sort,page,quote,chain,robinhoodMainnetFactory:ROBINHOOD_MAINNET_FACTORY_ADDRESS?.toLowerCase()??null,now});
  // Only registered mainnet launches belong on the production board; testnet remains in its dedicated catalog.
  // Do not delay this response or claim that background observations are already
  // present. The next visible-directory poll reads their persisted snapshots.
  waitUntil(refreshDiscoveryMarkets({db:database(),platform,now,readMarket:(mint:string)=>serverMarket(mint,{viewer:true})}).catch(()=>{}));
  waitUntil(backfillEventTimes({db:database(),platform,now,chain:(method:string,params:unknown[])=>solanaChain('mainnet-beta',method,params)}).catch(()=>{}));
  const enrich=(rows:typeof result.selected)=>{const parsed=discoveryRecords(rows,platform);return enrichDiscovery(parsed.records,parsed.cache,platform,result.officialMint,now);};
  const tokens=enrich(result.selected),featured=enrich(result.featured);
  let identities:Record<string,{username:string}>={};try{identities=await identityCards(database(),[...tokens,...featured].filter(token=>token.chain!=='robinhood').map(token=>token.creator).filter((creator):creator is string=>Boolean(creator)),{limit:40});}catch{identities={};}
  const withIdentity=<T extends {creator?:string}>(rows:T[])=>rows.map(token=>({...token,creatorIdentity:token.creator?identities[token.creator]||null:null}));
  return Response.json({...result,selected:undefined,tokens:withIdentity(tokens),featured:withIdentity(featured),updatedAt:now,stale:false,totalIndexed:result.total,coverage:'All indexed launches; historical completeness not yet verified.'},{headers});
 }catch(error){console.error('grainpad_discovery_error',error instanceof Error?error.message:'Unknown error');return Response.json({error:'The token directory is temporarily unavailable. Please try again.'},{status:503,headers});}
}
