import test from 'node:test';
import assert from 'node:assert/strict';
import {lifecycleState,marketFailure,MarketReadError,plainDecimal} from '../lib/native-market.mjs';
import {discoveryRecords,enrichDiscovery} from '../lib/token-discovery.ts';
import {geckoFallbackAllowed} from '../lib/native-history.mjs';

test('lifecycle distinguishes a full curve from a pending migration',()=>{
 assert.equal(lifecycleState({route:'curve',raised:'10',target:'85'}),'curve_live');
 assert.equal(lifecycleState({route:'curve',raised:'85',target:'85'}),'curve_complete');
 assert.equal(lifecycleState({route:'graduating',raised:'85',target:'85'}),'migration_pending');
 assert.equal(lifecycleState({route:'cpmm'}),'raydium_live');
 assert.equal(lifecycleState({}),'unavailable');
 assert.equal(lifecycleState({route:'curve',migrationFailed:true}),'migration_failed');
});

test('a pool read failure is unavailable and only a missing index row is not registered',()=>{
 const missing=marketFailure(new MarketReadError('not_registered','This mint is not a registered Grainpad launch.',null));
 assert.equal(missing.status,'not_registered');assert.equal(missing.identity,null);
 const chain=marketFailure(new MarketReadError('unavailable','Market data is temporarily unavailable.',{name:'N',symbol:'S'}));
 assert.equal(chain.status,'unavailable');assert.equal(chain.identity.name,'N');
 assert.equal(marketFailure(Error('Grainpad launch pool not found.')).status,'unavailable');
 assert.equal(marketFailure(Error('Network mismatch.')).error,'Market data is temporarily unavailable.');
});

test('young launches still skip the external history fallback',()=>{
 assert.equal(geckoFallbackAllowed(new Date().toISOString(),{status:'not-indexed'},0),false);
 assert.equal(geckoFallbackAllowed('2020-01-01T00:00:00Z',{status:'not-indexed'},0),true);
 assert.equal(geckoFallbackAllowed('2020-01-01T00:00:00Z',{status:'no-trades'},0),false);
 assert.equal(plainDecimal(1.23e-8),'0.0000000123');
 assert.equal(plainDecimal(1.23e-8).includes('e'),false);
});

test('one corrupt discovery row does not drop the rest',()=>{
 const parsed=discoveryRecords([
  {record:'{',market:'{"pool":"p"}'},
  {record:JSON.stringify({mint:'mint1',name:'One',symbol:'O',pool:'pool1',quoteAsset:'SOL',createdAt:new Date().toISOString()}),market:'not-json'},
 ],'platform');
 assert.equal(parsed.records.length,1);
 assert.equal(parsed.cache.length,0);
 assert.equal(enrichDiscovery(parsed.records,[],'platform',null)[0].lifecycle,'unavailable');
});
