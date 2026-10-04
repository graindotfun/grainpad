import {isPreviousOfficialMint} from './previous-official-mints.mjs';
/** All filters and pagination run over the full index; only the selected page crosses the wire. */
export async function queryDiscovery(db,{platform,search='',filter='all',sort='newest',page=1,quote='all',now=Date.now()}){
 const filters={all:'1',new:"state IN ('curve','graduating')",near:"state='curve' AND progress>=80",graduated:"state='graduated'"};
 const sorts={newest:'created_at DESC,mint DESC',oldest:'created_at,mint','market-cap':'market_cap IS NULL,market_cap DESC,created_at DESC,mint DESC',volume:'volume IS NULL,volume DESC,created_at DESC,mint DESC'};
 if(!['all','SOL','wXMR'].includes(quote)||!Object.hasOwn(filters,filter)||!Object.hasOwn(sorts,sort)||search.length>128||!Number.isSafeInteger(page)||page<1)throw Error('Invalid directory request.');
 const cte=`WITH snapshots AS (SELECT l.*,m.value AS market,m.updated_at AS market_time,c.value AS chart,c.updated_at AS chart_time FROM launch_index l LEFT JOIN market_cache m ON m.key=('market:v3:'||l.platform_id||':'||l.mint) AND m.updated_at>=? AND json_extract(m.value,'$.mint')=l.mint AND json_extract(m.value,'$.launchPool')=l.pool LEFT JOIN market_cache c ON c.key=('chart:v3:'||json_extract(m.value,'$.pool')) AND c.updated_at>=? AND json_extract(c.value,'$.available')=1 WHERE l.network='mainnet-beta' AND l.platform_id=? AND (?='all' OR json_extract(l.record,'$.quoteAsset')=?)), directory AS (SELECT *,CASE json_extract(market,'$.route') WHEN 'curve' THEN 'curve' WHEN 'graduating' THEN 'graduating' WHEN 'cpmm' THEN 'graduated' ELSE 'unknown' END AS state,100.0*cast(json_extract(market,'$.progress.raised') AS REAL)/nullif(cast(json_extract(market,'$.progress.target') AS REAL),0) AS progress,COALESCE(json_extract(market,'$.native.marketCapUsd'),json_extract(chart,'$.stats.marketCap')) AS market_cap,COALESCE(json_extract(market,'$.native.volume24hUsd'),json_extract(chart,'$.stats.volume')) AS volume FROM snapshots)`;
 const base=[now-300_000,now-300_000,platform,quote,quote];
 const all=await db.prepare(cte+` SELECT count(*) AS total,sum(state IN ('curve','graduating')) AS new,sum(state='curve' AND progress>=80) AS near,sum(state='graduated') AS graduated,sum(state='unknown') AS unknown FROM directory`).bind(...base).first();
 const where=`${filters[filter]} AND (?='' OR instr(lower(json_extract(record,'$.name')||' '||json_extract(record,'$.symbol')||' '||mint),?)>0)`;
 const q=search.trim().toLowerCase(),args=[...base,q,q];
 const count=await db.prepare(cte+` SELECT count(*) AS total FROM directory WHERE ${where}`).bind(...args).first();
 const pages=Math.max(1,Math.ceil(count.total/20));page=Math.min(page,pages);
 const official=await db.prepare('SELECT mint FROM official_token WHERE id=1').first();const officialMint=official?.mint&&!isPreviousOfficialMint(official.mint)?official.mint:null;
 const selected=await db.prepare(cte+` SELECT * FROM directory WHERE ${where} ORDER BY (mint=?) DESC,${sorts[sort]} LIMIT 20 OFFSET ?`).bind(...args,officialMint,(page-1)*20).all();
 const featured=await db.prepare(cte+" SELECT * FROM directory WHERE state='graduated' ORDER BY (mint=?) DESC,created_at DESC,mint DESC LIMIT 5").bind(...base,officialMint).all();
 return {selected:selected.results,featured:featured.results,total:all.total,filteredTotal:count.total,page,pages,pageSize:20,counts:{all:all.total,new:all.new||0,near:all.near||0,graduated:all.graduated||0,unknown:all.unknown||0},officialMint};
}
