import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {deploymentVersion} from '../lib/deployment-version.mjs';

const commit='a'.repeat(40),timestamp='2026-09-29T09:00:00Z';
test('release version uses the matching Cloudflare version tag and timestamp',()=>{
  assert.deepEqual(deploymentVersion({tag:commit,timestamp},commit),{commit,deployedAt:'2026-09-29T09:00:00.000Z'});
});
test('missing, malformed or mismatched version metadata never claims a deployment',()=>{
  for(const metadata of [undefined,{}, {tag:commit}, {tag:'main',timestamp},
    {tag:'b'.repeat(40),timestamp},{tag:commit,timestamp:'invalid'}]){
    assert.deepEqual(deploymentVersion(metadata,commit),{commit:null,deployedAt:null});
  }
  assert.deepEqual(deploymentVersion({tag:commit,timestamp},null),{commit:null,deployedAt:null});
});
test('Sites release identity must equal the compiled main commit; timestamps are never invented',()=>{
 assert.deepEqual(deploymentVersion(undefined,commit,commit),{commit,deployedAt:null});
 assert.deepEqual(deploymentVersion({timestamp},commit,commit),{commit,deployedAt:'2026-09-29T09:00:00.000Z'});
 for(const sitesCommit of ['main','b'.repeat(40),undefined])assert.deepEqual(deploymentVersion(undefined,commit,sitesCommit),{commit:null,deployedAt:null});
 assert.deepEqual(deploymentVersion(undefined,null,commit),{commit:null,deployedAt:null});
 // Sites may tag its transport mirror with a different history SHA.
 assert.deepEqual(deploymentVersion({tag:'b'.repeat(40),timestamp},commit,commit),{commit,deployedAt:'2026-09-29T09:00:00.000Z'});
 assert.deepEqual(deploymentVersion({tag:commit,timestamp},commit,'b'.repeat(40)),{commit:null,deployedAt:null});
});
test('the real version route is uncached and fails closed on mismatched build metadata',async()=>{
  globalThis.__versionMetadata={tag:commit,timestamp};
  await build({entryPoints:['app/api/version/route.ts'],outfile:'.test-output/version-route.mjs',bundle:true,
    platform:'node',format:'esm',packages:'external',logLevel:'silent',define:{__GRAINPAD_COMMIT__:JSON.stringify(commit)},
    plugins:[{name:'fake-worker-metadata',setup(b){
      b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'worker-env',namespace:'test'}));
      b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env={get CF_VERSION_METADATA(){return globalThis.__versionMetadata;},get GRAINPAD_DEPLOY_COMMIT(){return globalThis.__sitesCommit;}};',loader:'js'}));
    }}]});
  const {GET}=await import('../.test-output/version-route.mjs');
  const response=GET();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{commit,deployedAt:'2026-09-29T09:00:00.000Z'});
  globalThis.__versionMetadata={tag:'b'.repeat(40),timestamp};
  assert.equal(GET().status,503);assert.deepEqual(await GET().json(),{commit:null,deployedAt:null});
  globalThis.__versionMetadata=undefined;globalThis.__sitesCommit=commit;
  assert.equal(GET().status,200);assert.deepEqual(await GET().json(),{commit,deployedAt:null});
  globalThis.__sitesCommit='b'.repeat(40);assert.equal(GET().status,503);delete globalThis.__sitesCommit;
});
