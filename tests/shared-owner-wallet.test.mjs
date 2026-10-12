import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {OFFICIAL_LAUNCH_CREATOR} from '../lib/official-launch-policy.mjs';
import {PLATFORM_SETTINGS} from '../lib/platform-settings.mjs';
import {legacyWallet} from '../lib/wallet-adapters.mjs';
import {PublicKey} from '@solana/web3.js';
const outfile='.test-output/shared-owner-wallet.mjs';
await build({stdin:{contents:"export {useSharedWallet} from './components/use-shared-wallet';export {walletSession} from './lib/wallet-session.mjs';",resolveDir:process.cwd()},outfile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',plugins:[{name:'react-effects',setup(b){b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export const useEffectEvent=f=>f;export function useEffect(f){globalThis.__sharedOwnerEffects.push(f);}'}));}}]});
const {useSharedWallet,walletSession}=await import('../'+outfile);
test('header creator connection hydrates the creator role and rejects foreign/admin identities',()=>{
 globalThis.__sharedOwnerEffects=[];walletSession.clear();
 const creator={current:null},admin={current:null};let creatorKey='',adminKey='';
 useSharedWallet(creator,k=>creatorKey=k,undefined,OFFICIAL_LAUNCH_CREATOR);
 useSharedWallet(admin,k=>adminKey=k,undefined,PLATFORM_SETTINGS.admin);
 const stops=globalThis.__sharedOwnerEffects.map(effect=>effect());
 const wallet=owner=>({publicKey:{toBase58:()=>owner},signMessage:()=>assert.fail('Hydration must never request a signature'),signTransaction:()=>assert.fail('Hydration must never request a transaction')});
 try{
  const c=wallet(OFFICIAL_LAUNCH_CREATOR);walletSession.activate(c,'Phantom');
  assert.equal(creator.current,c);assert.equal(creatorKey,OFFICIAL_LAUNCH_CREATOR);assert.equal(admin.current,null);assert.equal(adminKey,'');
  const a=wallet(PLATFORM_SETTINGS.admin);walletSession.activate(a,'Phantom');
  assert.equal(admin.current,a);assert.equal(adminKey,PLATFORM_SETTINGS.admin);assert.equal(creator.current,null);assert.equal(creatorKey,'');
  walletSession.activate(wallet('foreign'),'Phantom');assert.equal(creator.current,null);assert.equal(admin.current,null);
  walletSession.clear();assert.equal(creatorKey,'');assert.equal(adminKey,'');
 }finally{for(const stop of stops)stop();walletSession.clear();delete globalThis.__sharedOwnerEffects;}
});

 test('two valid local role wallets survive header switches but changed/disconnected identities are cleared',()=>{
 globalThis.__sharedOwnerEffects=[];walletSession.clear();let creatorKey='',adminKey='';
 const c={publicKey:{toBase58:()=>OFFICIAL_LAUNCH_CREATOR}},a={publicKey:{toBase58:()=>PLATFORM_SETTINGS.admin}};
 const creator={current:c},admin={current:a};useSharedWallet(creator,k=>creatorKey=k,undefined,OFFICIAL_LAUNCH_CREATOR,true);useSharedWallet(admin,k=>adminKey=k,undefined,PLATFORM_SETTINGS.admin,true);const stops=globalThis.__sharedOwnerEffects.map(effect=>effect());
 try{walletSession.activate(c,'creator provider');assert.equal(creator.current,c);assert.equal(admin.current,a);walletSession.activate(a,'admin provider');assert.equal(creator.current,c);assert.equal(admin.current,a);assert.equal(creatorKey,OFFICIAL_LAUNCH_CREATOR);assert.equal(adminKey,PLATFORM_SETTINGS.admin);c.publicKey={toBase58:()=>'foreign'};walletSession.activate(a,'admin provider');assert.equal(creator.current,null);assert.equal(creatorKey,'');a.publicKey=null;walletSession.clear();assert.equal(admin.current,null);assert.equal(adminKey,'');}finally{for(const stop of stops)stop();walletSession.clear();delete globalThis.__sharedOwnerEffects;}
 });

 test('normalized session adapters clear the previous role on provider invalidation',async()=>{
 globalThis.__sharedOwnerEffects=[];walletSession.clear();let creatorKey='',adminKey='';const creator={current:null},admin={current:null};useSharedWallet(creator,k=>creatorKey=k,undefined,OFFICIAL_LAUNCH_CREATOR,true);useSharedWallet(admin,k=>adminKey=k,undefined,PLATFORM_SETTINGS.admin,true);const stops=globalThis.__sharedOwnerEffects.map(effect=>effect());
 const raw=owner=>({publicKey:new PublicKey(owner),connect:async()=>{},on(){},removeListener(){},signTransaction(){assert.fail('No signing');}});const c=legacyWallet(raw(OFFICIAL_LAUNCH_CREATOR)),a=legacyWallet(raw(PLATFORM_SETTINGS.admin));
 try{await c.connect();await a.connect();walletSession.activate(c,'creator');assert.equal(creator.current,c);walletSession.activate(a,'admin');assert.equal(c.publicKey,null);assert.equal(creator.current,null);assert.equal(creatorKey,'');assert.equal(admin.current,a);assert.equal(adminKey,PLATFORM_SETTINGS.admin);}finally{for(const stop of stops)stop();walletSession.clear();delete globalThis.__sharedOwnerEffects;}
 });
