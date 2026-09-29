import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {sharedMarketCache} from '../lib/shared-market-cache.mjs';
import {pinOfficial,isOwnPlatform} from '../lib/launch-identity.mjs';
import {creationOnly} from '../lib/trade-activity.mjs';
import {readLaunchRecords} from '../lib/launch-records.ts';
import bs58 from 'bs58';
function database(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0003_classy_echo.sql',import.meta.url),'utf8'));return {sqlite,prepare(sql){const statement=sqlite.prepare(sql);return {bind(...values){return {first:async()=>statement.get(...values)??null,run:async()=>statement.run(...values)}}}}};}
test('100 simultaneous viewers share one cold refresh across independent cache calls',async()=>{
 const db=database();let calls=0;const load=async()=>{calls++;await new Promise(r=>setTimeout(r,80));return {pool:'ours',value:42}};
 const values=await Promise.all(Array.from({length:100},()=>sharedMarketCache(db,'same-pool',load)));
 assert.equal(calls,1);assert.equal(values.length,100);assert.ok(values.every(x=>x.data.value===42&&!x.stale));
 const again=await sharedMarketCache(db,'same-pool',()=>{throw Error('must not load')});assert.equal(again.data.value,42);
});
test('provider errors preserve timestamp, signal stale and back off globally',async()=>{
 const db=database();let time=1000,calls=0;const options={ttl:30_000,maxStale:300_000,now:()=>time};
 await sharedMarketCache(db,'pool',async()=>({value:9}),options);time=32_000;
 const load=async()=>{calls++;throw Error('429')};const a=await sharedMarketCache(db,'pool',load,options),b=await sharedMarketCache(db,'pool',load,options);
 assert.equal(a.updatedAt,1000);assert.equal(b.updatedAt,1000);assert.ok(a.stale&&b.stale);assert.equal(calls,1);
 time=400_000;await assert.rejects(sharedMarketCache(db,'pool',load,options),/429/);
});
test('a stalled lease cannot cause a second refresh or overwrite a newer owner',async()=>{
 const db=database();await db.prepare('INSERT INTO market_cache (key,lease_until,lease_owner) VALUES (?,?,?)').bind('pool',99999,'other-worker').run();let calls=0;
 await assert.rejects(sharedMarketCache(db,'pool',async()=>{calls++;return {}},{now:()=>1000,sleep:async()=>{}}),/updating/);assert.equal(calls,0);
});
test('cache-only market reads never refresh without a visible token-page request',async()=>{
 const db=database();let calls=0,time=1000;const load=async()=>{calls++;return {price:1};};
 await assert.rejects(()=>sharedMarketCache(db,'viewer-pool',load,{refresh:false,now:()=>time}),/token page is visible/);assert.equal(calls,0);
 await sharedMarketCache(db,'viewer-pool',load,{now:()=>time});time=32000;
 const cached=await sharedMarketCache(db,'viewer-pool',load,{refresh:false,now:()=>time});assert(cached.stale);assert.equal(calls,1);
 await sharedMarketCache(db,'viewer-pool',load,{refresh:true,now:()=>time});assert.equal(calls,2);
});
test('exact official mint is pinned; identical names, unicode lookalikes and forged flags are not official',()=>{
 const rows=[{mint:'copy',name:'Grainpad',symbol:'GRAIN',official:true},{mint:'lookalike',name:'Graіnpad',symbol:'GRAІN',official:true},{mint:'real',name:'Grainpad',symbol:'GRAIN'}];
 assert.deepEqual(pinOfficial(rows,'real').map(r=>[r.mint,r.official]),[['real',true],['copy',false],['lookalike',false]]);
 assert.ok(pinOfficial(rows,null).every(r=>!r.official));assert.equal(isOwnPlatform('reference','ours'),false);
});
test('directory fails closed on reference-platform, foreign and old records missing provenance',async()=>{
 const base={mint:'So11111111111111111111111111111111111111112',name:'Grainpad',symbol:'GRAIN',network:'mainnet-beta',verification:'confirmed-on-chain',createdAt:'2026-09-29T00:00:00.000Z'};
 const records=[{...base,platformId:'ours'},{...base,platformId:'reference'},{...base,platformId:'foreign'},base,{...base,platformId:'ours',verification:'awaiting-finalization'}];
 const storage={list:async()=>({objects:records.map((_,i)=>({key:String(i)})),truncated:false}),get:async key=>({text:async()=>JSON.stringify(records[Number(key)])})};
 assert.equal((await readLaunchRecords(storage,'mainnet-beta','ours')).length,1);
});
test('no-trades proof requires a successful creation-only transaction, including inner instructions',()=>{
 const init={programIdIndex:0,accounts:[1],data:bs58.encode(Uint8Array.from([67,153,175,39,218,16,38,32]))};
 const tx={transaction:{message:{accountKeys:['launchlab','pool'],instructions:[init]}},meta:{err:null,innerInstructions:[]}};
 assert.equal(creationOnly(tx,'launchlab','pool'),true);
 assert.equal(creationOnly({...tx,meta:{err:{InstructionError:1},innerInstructions:[]}},'launchlab','pool'),false);
 assert.equal(creationOnly({...tx,meta:{err:null,innerInstructions:[{instructions:[{...init,data:bs58.encode(new Uint8Array(8))}]}]}},'launchlab','pool'),false);
 assert.equal(creationOnly(null,'launchlab','pool'),false);
});

test('market snapshot batches curve accounts once, rejects foreign platform and switches to the exact CPMM pool',async()=>{
 const {readMarketSnapshot}=await import('../lib/market-snapshot.mjs');
 const {PublicKey}=await import('@solana/web3.js');
 const {NATIVE_MINT,TOKEN_PROGRAM_ID}=await import('@solana/spl-token');
 const s=await import('@raydium-io/raydium-sdk-v2');
 const mint=new PublicKey('EMv8zka4gJdUSEnVyGsLz6PgfB4d2YKF6HhG6pjfft6c'),platform=new PublicKey('d9EBYYKcBccQoZWn9uMHnmbMw8PVh46WXrKZFpYaKoV'),config=new PublicKey('6s1xP3hpbAfFoNtUNF8mfHsjr2Bd97JxFJRWLbL6aHuX');
 const pool=s.LaunchpadPool.decode(Buffer.alloc(s.LaunchpadPool.span));Object.assign(pool,{mintA:mint,mintB:NATIVE_MINT,platformId:platform,configId:config,status:0});
 const cfg=s.LaunchpadConfig.decode(Buffer.alloc(s.LaunchpadConfig.span)),pf=s.PlatformConfig.decode(Buffer.alloc(s.PlatformConfig.span));
 const encode=(layout,value,owner=s.LAUNCHPAD_PROGRAM)=>{const b=Buffer.alloc(layout.span);layout.encode(value,b);return {owner:owner.toBase58(),data:[b.toString('base64'),'base64']}};
 let reads=0;const call=async()=>{reads++;return {context:{slot:100},value:[encode(s.LaunchpadPool,pool),encode(s.LaunchpadConfig,cfg),encode(s.PlatformConfig,pf),{owner:TOKEN_PROGRAM_ID.toBase58()}]}};
 let view=await readMarketSnapshot(call,mint.toBase58(),platform.toBase58(),config.toBase58());assert.equal(reads,1);assert.equal(view.route,'curve');assert.equal(view.activityObserved,false);
 pool.platformId=PublicKey.default;await assert.rejects(readMarketSnapshot(call,mint.toBase58(),platform.toBase58(),config.toBase58()),/not launched via Grainpad/);pool.platformId=platform;
 pool.status=1;view=await readMarketSnapshot(call,mint.toBase58(),platform.toBase58(),config.toBase58());assert.equal(view.route,'graduating');
 pool.status=2;reads=0;
 const cp=s.CpmmPoolInfoLayout.decode(Buffer.alloc(s.CpmmPoolInfoLayout.span));Object.assign(cp,{configId:pf.cpConfigId,mintA:mint,mintB:NATIVE_MINT,mintProgramA:TOKEN_PROGRAM_ID,mintProgramB:TOKEN_PROGRAM_ID});
 const cc=s.CpmmConfigInfoLayout.decode(Buffer.alloc(s.CpmmConfigInfoLayout.span));
 const graduated=async()=>reads===0?call():(reads++,{value:[encode(s.CpmmPoolInfoLayout,cp,s.CREATE_CPMM_POOL_PROGRAM),encode(s.CpmmConfigInfoLayout,cc,s.CREATE_CPMM_POOL_PROGRAM)]});
 view=await readMarketSnapshot(graduated,mint.toBase58(),platform.toBase58(),config.toBase58());assert.equal(reads,2);assert.equal(view.route,'cpmm');assert.notEqual(view.pool,view.launchPool);
});

test('server cache registers its entire operation with Worker waitUntil before yielding',async()=>{
 const ts=await import('typescript'),vm=await import('node:vm');const kept=[];
 const source=readFileSync(new URL('../lib/server-cache.ts',import.meta.url),'utf8');
 const code=ts.default.transpileModule(source,{compilerOptions:{module:ts.default.ModuleKind.CommonJS,target:ts.default.ScriptTarget.ES2022}}).outputText;
 const context={exports:{},require:name=>name==='cloudflare:workers'?{waitUntil:p=>kept.push(p)}:{sharedMarketCache}};vm.runInNewContext(code,context);
 const db=database();let release;const gate=new Promise(r=>{release=r});
 const request=context.exports.sharedMarketCache(db,'disconnect',async()=>{await gate;return {completed:true}});
 assert.equal(kept.length,1);release();await kept[0];assert.equal((await request).data.completed,true);
 assert.ok(db.sqlite.prepare('SELECT value FROM market_cache WHERE key=?').get('disconnect').value.includes('completed'));
});
