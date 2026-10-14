/** Display-only projection of registered mainnet launches. No signing or transaction construction. */
import {takeBudget} from '../shared-market-cache.mjs';
import {describeMainnetReceipt,readRobinhoodMainnetLaunch,type MainnetLaunchRecord} from './robinhood-mainnet-registration.ts';
import type {Rpc} from './robinhood-market.ts';
import type {Db,Store} from './robinhood-index.ts';
const NETWORK='robinhood:mainnet',PREFIX='robinhood-launches/4663/',CURSOR='robinhood-mainnet-directory-cursor:v1';
export async function mainnetLaunchTime(record:MainnetLaunchRecord,rpc:Rpc):Promise<string|null>{
 try{
  if(BigInt(await rpc('eth_chainId',[]) as string)!==4663n)return null;
  const receipt=await rpc('eth_getTransactionReceipt',[record.transactionHash]) as {blockNumber?:string;blockHash?:string};
  const verified=describeMainnetReceipt(receipt,record.factory,record.transactionHash);
  if(verified.tokenAddress!==record.tokenAddress||verified.launchId!==record.launchId||verified.creator!==record.creator||!receipt.blockNumber)return null;
  const block=await rpc('eth_getBlockByNumber',[receipt.blockNumber,false]) as {hash?:string;timestamp?:string};
  if(block.hash!==receipt.blockHash||typeof block.timestamp!=='string'||!/^0x[0-9a-f]+$/i.test(block.timestamp))return null;
  const seconds=Number(BigInt(block.timestamp));
  return Number.isSafeInteger(seconds)&&seconds>0&&seconds*1000<=Date.now()?new Date(seconds*1000).toISOString():null;
 }catch{return null;}
}
export async function upsertMainnetDirectoryRow(db:Db,record:MainnetLaunchRecord,createdAt:string,launchedAt:string|null,now=Date.now()){
 const row={...record,mint:record.tokenAddress,network:NETWORK,platformId:record.factory,pool:record.launchId,platformName:'Grainpad',image:record.display?.metadata.imageHash?`/api/assets/${record.display.metadata.imageHash}`:'',quoteAsset:'ETH',verification:'confirmed-on-chain',createdAt,...(launchedAt?{launchedAt}:{})};
 await db.prepare(`INSERT INTO launch_index(network,mint,platform_id,creator,pool,created_at,record,indexed_at) VALUES(?,?,?,?,?,?,?,?)
 ON CONFLICT(network,mint) DO UPDATE SET record=CASE WHEN json_extract(excluded.record,'$.launchedAt') IS NULL AND json_extract(launch_index.record,'$.launchedAt') IS NOT NULL THEN json_set(excluded.record,'$.launchedAt',json_extract(launch_index.record,'$.launchedAt')) ELSE excluded.record END,indexed_at=excluded.indexed_at
 WHERE launch_index.platform_id=excluded.platform_id AND launch_index.creator=excluded.creator AND launch_index.pool=excluded.pool`).bind(NETWORK,record.tokenAddress,record.factory,record.creator,record.launchId,createdAt,JSON.stringify(row),now).run();
}
export async function syncRobinhoodMainnetLaunches({db,storage,factory,rpc,now=Date.now()}:{db:Db;storage:Store;factory:string;rpc:Rpc;now?:number}){
 if(!await takeBudget(db,`rh-mainnet-directory:v1:${factory}`,1,1,30_000,now))return {indexed:0};
 let cursor=(await db.prepare('SELECT value FROM market_cache WHERE key=?').bind(CURSOR).first<{value:string}>())?.value||undefined,indexed=0,rpcLeft=2;
 for(let page=0;page<2;page++){
  const listed=await storage.list({prefix:PREFIX,limit:10,...(cursor?{cursor}:{})});
  for(const object of listed.objects){
   if(!object.key.startsWith(PREFIX))continue;
   let record:MainnetLaunchRecord|null=null;try{record=await readRobinhoodMainnetLaunch(storage,object.key.slice(PREFIX.length),factory);}catch{continue;}
   if(!record)continue;
   const existing=await db.prepare("SELECT json_extract(record,'$.launchedAt') AS launched,created_at FROM launch_index WHERE network=? AND mint=?").bind(NETWORK,record.tokenAddress).first<{launched:string|null;created_at:string}>();
   let launchedAt=existing?.launched??null;
   if(!launchedAt&&rpcLeft>0){rpcLeft--;launchedAt=await mainnetLaunchTime(record,rpc);}
   await upsertMainnetDirectoryRow(db,record,existing?.created_at??(object.uploaded??new Date(now)).toISOString(),launchedAt,now);indexed++;
  }
  cursor=listed.truncated?listed.cursor:undefined;if(!cursor)break;
 }
 await db.prepare('INSERT INTO market_cache(key,value,updated_at,expires_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(CURSOR,cursor??'',now,now).run();
 return {indexed};
}
