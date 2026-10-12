import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

test('loading the launch module loads wallet signing before any review or wallet request',async()=>{
 const directory=await mkdtemp(resolve('.test-output/launch-signing-load-'));
 const state={loaded:0,requested:0};globalThis.launchSigningLoadFixture=state;
 try{
  const outfile=resolve(directory,'launch.mjs');
  await build({entryPoints:['lib/launch.ts'],outfile,bundle:true,packages:'external',platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'observe-signing-module-load',setup(b){
   b.onResolve({filter:/^\.\/wallet-signing\.mjs$/},()=>({path:'wallet-signing',namespace:'observe'}));
   b.onLoad({filter:/.*/,namespace:'observe'},()=>({contents:`
    globalThis.launchSigningLoadFixture.loaded++;
    export async function signWalletFirst(){globalThis.launchSigningLoadFixture.requested++;throw Error('No wallet requests in this fixture.');}
    export async function coSignDeferred(){throw Error('No co-signing in this fixture.');}
   `,loader:'js'}));
  }}]});
  assert.equal(state.loaded,0);
  const launch=await import(pathToFileURL(outfile).href);
  assert.equal(typeof launch.prepareLaunch,'function');assert.equal(typeof launch.signAndSend,'function');
  assert.equal(state.loaded,1,'The signing dependency must already be loaded when a token review can first be prepared; it cannot wait until the wallet_requested stage.');
  assert.equal(state.requested,0,'Loading code must never request a wallet signature.');
 }finally{delete globalThis.launchSigningLoadFixture;await rm(directory,{recursive:true,force:true});}
});
