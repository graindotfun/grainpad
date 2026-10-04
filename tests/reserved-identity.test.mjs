import test from 'node:test';
import assert from 'node:assert/strict';
import {reservedIdentity} from '../lib/launch-identity.mjs';
import {identityPolicy,SITE} from '../lib/site-config.ts';
import {OFFICIAL_ARTWORK} from '../lib/official-artwork.mjs';
import {PLATFORM_SETTINGS} from '../lib/platform-settings.mjs';
import {OFFICIAL_LAUNCH_CREATOR} from '../lib/official-launch-policy.mjs';
const stranger='9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
const plain={name:'Seed Cat',symbol:'SEED',imageHash:'0'.repeat(64),website:'https://seed.example/',twitter:'https://x.com/seedcat'};
test('a non-admin wallet cannot publish the official name, ticker, artwork or links',()=>{
 const policy=identityPolicy(stranger);
 assert.equal(reservedIdentity(plain,policy),null);
 assert.match(reservedIdentity({...plain,symbol:'GRAINU'},policy),/registered pilot token/);
 for(const draft of [{name:'Grainpad'},{symbol:'GRAIN'},{name:'Grаin'},{symbol:'GRA1N'},{name:'G\u200Brain Official'},{symbol:'$GRAIN'},{name:'Official GRAIN'},{symbol:'GRAINTOKEN'}])
  assert.match(reservedIdentity({...plain,...draft},policy),/reserved for the official token/);
 for(const draft of [{name:'Whole Grain'},{name:'Grain Bowl'},{symbol:'GRAINS'},{name:'Migraine'}])
  assert.equal(reservedIdentity({...plain,...draft},policy),null);
 assert.match(reservedIdentity({...plain,imageHash:OFFICIAL_ARTWORK.sha256},policy),/artwork is reserved/);
 for(const website of ['https://grainpad.fun/','https://GRAINPAD.fun/token','https://www.grainpad.fun/'])
  assert.match(reservedIdentity({...plain,website},policy),/own website/);
 assert.equal(reservedIdentity({...plain,website:'https://notgrainpad.fun/'},policy),null);
 for(const twitter of [SITE.twitter,'https://twitter.com/grainxmr/'])assert.match(reservedIdentity({...plain,twitter},policy),/X account/);
});
test('only the platform admin and the locked relaunch creator may use the official identity',()=>{
 const official={name:SITE.tokenName,symbol:SITE.tokenSymbol,imageHash:OFFICIAL_ARTWORK.sha256,website:SITE.origin+'/',twitter:SITE.twitter};
 assert.equal(reservedIdentity(official,identityPolicy(PLATFORM_SETTINGS.admin)),null);
 assert.equal(reservedIdentity(official,identityPolicy(OFFICIAL_LAUNCH_CREATOR)),null);
 assert.notEqual(reservedIdentity(official,identityPolicy(stranger)),null);
 assert.notEqual(reservedIdentity(official,{...identityPolicy(''),admin:''}),null,'An unset admin never exempts an empty owner.');
});
