/** Public catalog projection. Raw registration/publication readers remain in launch-index. */
import {PREVIOUS_OFFICIAL_MINTS} from './previous-official-mints.mjs';
import {verifiedCatalogWitnesses,catalogMembership} from './verified-monero-catalog.mjs';
/** @param {string|null} cursor @param {string|null} creator @param {string[]} excludeMints */
export async function indexedLaunchPage(db,network,platform,cursor=null,creator=null,excludeMints=PREVIOUS_OFFICIAL_MINTS.map(row=>row.mint)){
 let after=null;
 if(cursor){if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(cursor))throw Error('Invalid directory cursor.');after=await db.prepare('SELECT created_at,mint FROM launch_index WHERE network=? AND platform_id=? AND mint=?').bind(network,platform,cursor).first();if(!after)throw Error('Directory cursor not found.');}
 const excluded=(Array.isArray(excludeMints)?excludeMints:[]).filter(mint=>typeof mint==='string'&&mint.length>0);
 const exclusion=excluded.length?` AND mint NOT IN (${excluded.map(()=>'?').join(',')})`:'';
 const visible=network==='mainnet-beta'?await verifiedCatalogWitnesses(db,{network}):null;
 const filters='network=? AND platform_id=?'+(creator?' AND creator=?':'')+exclusion+(visible?' AND '+catalogMembership('launch_index'):'');const bindings=[network,platform,...(creator?[creator]:[]),...excluded,...(visible?[JSON.stringify(visible)]:[])];
 const count=await db.prepare(`SELECT count(*) AS total FROM launch_index WHERE ${filters}`).bind(...bindings).first();
 const page=await db.prepare(`SELECT record FROM launch_index WHERE ${filters}${after?' AND (created_at<? OR (created_at=? AND mint<?))':''} ORDER BY created_at DESC,mint DESC LIMIT 31`).bind(...bindings,...(after?[after.created_at,after.created_at,after.mint]:[])).all();
 const rows=[];for(const saved of page.results){try{const parsed=JSON.parse(saved.record);if(parsed?.mint)rows.push(parsed);}catch{/* One corrupt record does not fail the directory. */}}const launches=rows.slice(0,30);
 return {launches,total:Number(count?.total||0),nextCursor:rows.length>30?launches.at(-1).mint:null};
}
