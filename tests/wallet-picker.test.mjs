import test from 'node:test';
import assert from 'node:assert/strict';
import {groupWalletProviders,walletConnectError,addressGradient} from '../lib/wallet-picker.mjs';
import {walletIcon} from '../lib/wallet-adapters.mjs';
const p=(name,kind='injected',brand=name)=>({name,brand,kind,icon:null,wallet:{}});

test('a same-name Wallet Standard entry moves to More options and never replaces the injected row',()=>{
 const list=[p('Phantom'),p('MetaMask · Wallet Standard','standard','MetaMask'),p('Phantom · Wallet Standard','standard','Phantom')];
 const {rows,more}=groupWalletProviders(list);
 assert.deepEqual(rows.map(r=>[r.label,r.provider.kind]),[['Phantom','injected'],['MetaMask','standard']]);
 assert.deepEqual(more.map(r=>r.provider.name),['Phantom · Wallet Standard']);
});
test('every discovered provider stays selectable exactly once',()=>{
 const list=[p('Phantom'),p('Solflare'),p('Browser wallet'),p('Solflare · Wallet Standard','standard','solflare'),p('Example · Wallet Standard','standard','Example'),p('Example · Wallet Standard (2)','standard','Example')];
 const {rows,more}=groupWalletProviders(list);
 assert.deepEqual([...rows,...more].map(r=>r.provider.name).sort(),list.map(x=>x.name).sort());
 assert.deepEqual(more.map(r=>r.provider.name),['Solflare · Wallet Standard','Example · Wallet Standard (2)']);
});
test('last used provider is listed first; install links cover only missing wallets',()=>{
 const {rows,install,lastUsed}=groupWalletProviders([p('Phantom'),p('MetaMask · Wallet Standard','standard','MetaMask')],'MetaMask · Wallet Standard');
 assert.equal(rows[0].label,'MetaMask');assert.equal(lastUsed,'MetaMask · Wallet Standard');
 assert.deepEqual(install.map(i=>i.brand),['Solflare']);
 assert.equal(groupWalletProviders([],'Gone').lastUsed,'');
 assert.equal(groupWalletProviders([]).install.length,2);
});
test('only inert image data URIs are shown as wallet icons',()=>{
 assert.equal(walletIcon('data:image/svg+xml;base64,AAAA'),'data:image/svg+xml;base64,AAAA');
 for(const bad of ['https://evil.example/x.png','javascript:alert(1)','data:text/html,<b>x</b>',null,42,'data:image/png;base64,'+'A'.repeat(200001)])assert.equal(walletIcon(bad),null);
});
test('connect errors read as short reasons and avatars are deterministic',()=>{
 assert.equal(walletConnectError(Error('User rejected the request.'),'Phantom'),'The request was declined in Phantom.');
 assert.equal(walletConnectError(Error('boom'),'Phantom'),"Couldn't connect to Phantom. Try again.");
 assert.equal(addressGradient('abc'),addressGradient('abc'));assert.notEqual(addressGradient('abc'),addressGradient('abd'));
});
