import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {migrationFrozen,migrationFreezeResponse} from '../lib/migration-freeze.mjs';
test('pause blocks framework traffic and schedules before hooks, retaining pure identity and static reads',async()=>{
 const commit='a'.repeat(40),env={MIGRATION_WRITE_FREEZE:'true',GRAINPAD_DEPLOY_COMMIT:commit,DB:{prepare(){assert.fail('No database access');}},BUCKET:{get(){assert.fail('No storage mutation/read through the app');}},ASSETS:{fetch(){return new Response('test-disposable-static-asset');}}};
 for(const path of ['/','/api/internal/indexer','/api/internal/indexer?action=monero','/api/assets/'+'b'.repeat(64),'/api/rpc','/api/metadata','/api/market/test/live'])for(const method of ['GET','POST']){const r=await migrationFreezeResponse(new Request('https://example.test'+path,{method}),env,commit);assert.equal(r.status,503);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(r.headers.get('Retry-After'),'60');}
 const version=await migrationFreezeResponse(new Request('https://example.test/api/version'),env,commit);assert.deepEqual(await version.json(),{commit,deployedAt:null});
 const head=await migrationFreezeResponse(new Request('https://example.test/api/version',{method:'HEAD'}),env,commit);assert.equal(await head.text(),'');
 assert.equal(await(await migrationFreezeResponse(new Request('https://example.test/_next/static/chunks/test-disposable.js'),env,commit)).text(),'test-disposable-static-asset');
 assert.equal((await migrationFreezeResponse(new Request('https://example.test/_next/static/chunks/test-disposable.js',{method:'POST'}),env,commit)).status,503);
 const source=readFileSync(new URL('../worker.ts',import.meta.url),'utf8');const pause=source.indexOf('const frozen=migrationFreezeResponse');assert.ok(pause>source.indexOf('pathname===EXPORT_PATH'));assert.ok(pause<source.indexOf('return marketLive'));assert.ok(pause<source.indexOf('refreshMoneroOnIndexerTick(clean'));assert.match(source,/if\(migrationFrozen\(env\)\)return;[\s\S]*const jobs=\[runScheduledIndexer/);
});
test('normal operation stays unchanged; configured malformed pause fails closed',()=>{
 for(const env of [{},{MIGRATION_WRITE_FREEZE:'false'}]){assert.equal(migrationFrozen(env),false);assert.equal(migrationFreezeResponse(new Request('https://example.test/'),env,null),null);}
 for(const value of ['true','TRUE','',true])assert.equal(migrationFrozen({MIGRATION_WRITE_FREEZE:value}),true);
 const response=migrationFreezeResponse(new Request('https://example.test/api/version'),{MIGRATION_WRITE_FREEZE:'true',GRAINPAD_DEPLOY_COMMIT:'b'.repeat(40)},'a'.repeat(40));assert.equal(response.status,503);
});
