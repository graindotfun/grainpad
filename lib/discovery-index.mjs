import {isPreviousOfficialMint,PREVIOUS_OFFICIAL_MINTS} from './previous-official-mints.mjs';
import {WITHDRAWN_ROBINHOOD_MAINNET} from './robinhood-publication.mjs';
import {retiredTokens} from './retired-evm-launches.mjs';
import {CHAIN_RECORD_NETWORKS} from './chain-display.ts';
import {NEW_TOKEN_WINDOW_MS} from './token-time.ts';
/** All filters and pagination run over the full index; only the selected page crosses the wire. */
export async function queryDiscovery(db,{platform,search='',filter='all',sort='newest',page=1,quote='all',chain='all',robinhoodFactory=/** @type {string|null} */(null),robinhoodMainnetFactory=/** @type {string|null} */(null),robinhoodMainnetFactories=/** @type {string[]} */(robinhoodMainnetFactory?[robinhoodMainnetFactory]:[]),now=Date.now()}){
 // NEW is the shared 12-hour launch window over the on-chain launch time. Missing, invalid and future launch times never match.
 const isNew='(launched_ms IS NOT NULL AND ?-launched_ms>=0 AND ?-launched_ms<?)',newArgs=[now,now,NEW_TOKEN_WINDOW_MS];
 const filters={all:'1',new:isNew,near:"state='curve' AND progress>=80",graduated:"state='graduated'"};
 const sorts={newest:'created_at DESC,mint DESC',oldest:'created_at,mint','market-cap':'market_cap IS NULL,market_cap DESC,created_at DESC,mint DESC',volume:'volume IS NULL,volume DESC,created_at DESC,mint DESC'};
 if(!['all','SOL','wXMR'].includes(quote)||!(chain==='all'||Object.hasOwn(CHAIN_RECORD_NETWORKS,chain))||!Object.hasOwn(filters,filter)||!Object.hasOwn(sorts,sort)||search.length>128||!Number.isSafeInteger(page)||page<1)throw Error('Invalid directory request.');
 const archivedMints=PREVIOUS_OFFICIAL_MINTS.map(row=>row.mint);
 // Match each chain to its reviewed owners; retired registrations never enter the visible directory.
 const isSolana=n=>n.startsWith('mainnet')||n.startsWith('devnet');
 const mainnetOwners=[...new Set(robinhoodMainnetFactories.map(f=>f.toLowerCase()))];
 const owners=n=>isSolana(n)?[platform]:n==='robinhood:mainnet'?mainnetOwners:robinhoodFactory?[robinhoodFactory]:[];
 const groups=networks=>[isSolana,n=>n==='robinhood:mainnet',n=>!isSolana(n)&&n!=='robinhood:mainnet'].map(pick=>networks.filter(n=>pick(n)&&owners(n).length)).filter(group=>group.length);
 const scope=networks=>{const parts=groups(networks).map(group=>`(l.network IN (${group.map(()=>'?').join(',')}) AND l.platform_id IN (${owners(group[0]).map(()=>'?').join(',')}))`);return parts.length?`(${parts.join(' OR ')})`:'0';};
 const scopeArgs=networks=>groups(networks).flatMap(group=>[...group,...owners(group[0])]);
 const cteFor=networks=>`WITH snapshots AS (SELECT l.*,m.value AS market,m.updated_at AS market_time,c.value AS chart,c.updated_at AS chart_time FROM launch_index l LEFT JOIN market_cache m ON m.key=('market:v3:'||l.platform_id||':'||l.mint) AND m.updated_at>0 AND m.updated_at<=? AND json_extract(m.value,'$.mint')=l.mint AND json_extract(m.value,'$.launchPool')=l.pool LEFT JOIN market_cache c ON c.key=('chart:v3:'||json_extract(m.value,'$.pool')) AND c.updated_at>0 AND c.updated_at<=? AND json_extract(c.value,'$.available')=1 WHERE ${scope(networks)} AND l.mint NOT IN (${archivedMints.map(()=>'?').join(',')}) AND NOT EXISTS (SELECT 1 FROM json_each(?) retired WHERE l.network='robinhood:mainnet' AND retired.value=l.mint) AND (?='all' OR json_extract(l.record,'$.quoteAsset')=?)), directory AS (SELECT *,CASE json_extract(market,'$.route') WHEN 'curve' THEN 'curve' WHEN 'graduating' THEN 'graduating' WHEN 'cpmm' THEN 'graduated' ELSE 'unknown' END AS state,100.0*cast(json_extract(market,'$.progress.raised') AS REAL)/nullif(cast(json_extract(market,'$.progress.target') AS REAL),0) AS progress,COALESCE(json_extract(market,'$.native.marketCapUsd'),json_extract(chart,'$.stats.marketCap')) AS market_cap,COALESCE(json_extract(market,'$.native.volume24hUsd'),json_extract(chart,'$.stats.volume')) AS volume,CAST(round((julianday(json_extract(record,'$.launchedAt'))-2440587.5)*86400000) AS INTEGER) AS launched_ms FROM snapshots)`;
 const allNetworks=Object.values(CHAIN_RECORD_NETWORKS).flat(),scopeNetworks=chain==='all'?allNetworks:[...CHAIN_RECORD_NETWORKS[chain]];
 const cte=cteFor(scopeNetworks),baseFor=networks=>[now,now,...scopeArgs(networks),...archivedMints,JSON.stringify([...retiredTokens('robinhood:mainnet'),...WITHDRAWN_ROBINHOOD_MAINNET]),quote,quote],base=baseFor(scopeNetworks);
 const all=await db.prepare(cte+` SELECT count(*) AS total,sum(CASE WHEN ${isNew} THEN 1 ELSE 0 END) AS new,sum(state='curve' AND progress>=80) AS near,sum(state='graduated') AS graduated,sum(state='unknown') AS unknown FROM directory`).bind(...base,...newArgs).first();
 const where=`${filters[filter]} AND (?='' OR instr(lower(json_extract(record,'$.name')||' '||json_extract(record,'$.symbol')||' '||mint),?)>0)`;
 const q=search.trim().toLowerCase(),args=[...base,...(filter==='new'?newArgs:[]),q,q];
 const count=await db.prepare(cte+` SELECT count(*) AS total FROM directory WHERE ${where}`).bind(...args).first();
 const pages=Math.max(1,Math.ceil(count.total/20));page=Math.min(page,pages);
 // Chain choices show how many launches each holds under the current quote market, independent of chain and status.
 const perNetwork=await db.prepare(cteFor(allNetworks)+' SELECT network,count(*) AS n FROM directory GROUP BY network').bind(...baseFor(allNetworks)).all();
 const chainCounts={all:0,solana:0,robinhood:0};
 for(const [key,networks] of Object.entries(CHAIN_RECORD_NETWORKS))chainCounts[key]=perNetwork.results.filter(row=>networks.includes(row.network)).reduce((sum,row)=>sum+row.n,0);
 chainCounts.all=chainCounts.solana+chainCounts.robinhood;
 const official=await db.prepare('SELECT mint FROM official_token WHERE id=1').first();const officialMint=official?.mint&&!isPreviousOfficialMint(official.mint)?official.mint:null;
 const selected=await db.prepare(cte+` SELECT * FROM directory WHERE ${where} ORDER BY (mint=?) DESC,${sorts[sort]} LIMIT 20 OFFSET ?`).bind(...args,officialMint,(page-1)*20).all();
 const featured=await db.prepare(cte+" SELECT * FROM directory WHERE state='graduated' ORDER BY (mint=?) DESC,created_at DESC,mint DESC LIMIT 5").bind(...base,officialMint).all();
 return {selected:selected.results,featured:featured.results,total:all.total,filteredTotal:count.total,page,pages,pageSize:20,chainCounts,counts:{all:all.total,new:all.new||0,near:all.near||0,graduated:all.graduated||0,unknown:all.unknown||0},officialMint};
}
