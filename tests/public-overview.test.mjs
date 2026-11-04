import test from 'node:test';
import assert from 'node:assert/strict';
import {canShowLaunchClaims,recordedBurns,displayRecordedBurns,compactRecordedBurns,compactReportedVolume} from '../lib/public-overview.mjs';

// Local evidence fixtures; never exposed through public routes.
const now=100_000;
const platform={active:true,policyMatches:true,kind:'grainpad',platformId:'test-platform',restrictionFlags:{globalConfig:1,curveParam:1},rules:[{symbol:'SOL'},{symbol:'wXMR'}]};
const verification={status:'PASS',readOnly:true,platform:'test-platform',mint:'test-mint',pool:'test-pool',checks:[{status:'PASS'}]};
const row=(p=platform)=>({value:JSON.stringify(p),updated_at:now-1000,expires_at:now+1000});
const official=(v=verification)=>({mint:'test-mint',pool:'test-pool',approval:JSON.stringify({verification:v})});

test('claims require both live quote rules and the matching published verification',()=>{
 assert.equal(canShowLaunchClaims(row(),official(),'test-platform',now),true);
 for(const data of [null,{}, {...row(),expires_at:now}, {...row(),updated_at:undefined}, {...row(),expires_at:undefined}, {...row(),updated_at:now-30_000}, {...row(),updated_at:now+1}, {...row(),value:'malformed'}])assert.equal(canShowLaunchClaims(data,official(),'test-platform',now),false);
 for(const p of [{...platform,active:false},{...platform,policyMatches:false},{...platform,stale:true},{...platform,rules:[{symbol:'SOL'},{symbol:'SOL'}]},{...platform,restrictionFlags:{globalConfig:1,curveParam:0}}])assert.equal(canShowLaunchClaims(row(p),official(),'test-platform',now),false);
});
test('a previous platform or a mismatched proof can never enable claims',()=>{
 assert.equal(canShowLaunchClaims(row(),official(),'new-platform',now),false);
 assert.equal(canShowLaunchClaims(row(),null,'test-platform',now),false);
 for(const v of [{...verification,status:'FAIL'},{...verification,mint:'copycat'},{...verification,platform:'foreign'},{...verification,checks:[]},{...verification,checks:[{status:'FAIL'}]}])assert.equal(canShowLaunchClaims(row(),official(v),'test-platform',now),false);
});
test('burn totals remain exact and missing receipts stay unknown',()=>{
 assert.equal(recordedBurns([]),null);
 assert.equal(recordedBurns([{kind:'claim',burned:'0'}]),null);
 assert.equal(recordedBurns([{kind:'buyback',burned:'9007199254740993000000'},{kind:'buyback',burned:'1'}]),'9007199254740993000001');
 assert.equal(recordedBurns([{kind:'buyback',burned:'0'}]),'0');
 assert.throws(()=>recordedBurns([{kind:'buyback',burned:'-1'}]));
});

test('wXMR-only rewards claims require the verified rewards service as well as launch rules',()=>{
 const rewardPlatform={...platform,rules:[{symbol:'wXMR'}],rewards:{configurationReady:true,operational:true}};
 assert.equal(canShowLaunchClaims(row(rewardPlatform),official(),'test-platform',now),true);
 assert.equal(canShowLaunchClaims(row({...rewardPlatform,rewards:{configurationReady:true,operational:false}}),official(),'test-platform',now),false);
});

const rewardBurn=(target='official',raw='1234567',signature='burn')=>({signature,mint:'other-source',kind:'burn',slot:42,verified_at:1,record:JSON.stringify({signature,mint:'other-source',kind:'burn',slot:42,burnedRaw:raw,receipt:{mint:target,slot:42,burnedRaw:raw}})});
test('burn totals use verified burn target, exclude retired and unverified records, and deduplicate signatures',()=>{
 assert.equal(recordedBurns([], [rewardBurn('retired'),{...rewardBurn(),verified_at:0}], 'official'),null);
 assert.equal(recordedBurns([], [rewardBurn()], 'official'),'1234567');
 assert.equal(recordedBurns([{kind:'buyback',signature:'burn',burned:'1234567'}],[rewardBurn()],'official'),'1234567');
 assert.throws(()=>recordedBurns([{kind:'buyback',signature:'burn',burned:'1'}],[rewardBurn()],'official'),/Conflicting/);
 assert.throws(()=>recordedBurns([],[{...rewardBurn(),slot:43}],'official'),/Invalid verified/);
 assert.equal(displayRecordedBurns('1000000'),'1.000000');
 assert.equal(displayRecordedBurns('9007199254740993000001'),'9007199254740993.000001');
});

test('homepage amounts stay compact without overstating exact receipts',()=>{
 assert.equal(compactRecordedBurns('1616893367599'),'1.61M');
 assert.equal(compactReportedVolume(396358.39),'$396.3K');
 assert.equal(compactRecordedBurns('999999999999'),'999.9K');
 assert.equal(compactRecordedBurns('1000000000000'),'1M');
 assert.equal(compactRecordedBurns('0'),'0');
 assert.equal(compactReportedVolume(123.45),'$123.45');
 assert.equal(displayRecordedBurns('1616893367599'),'1616893.367599');
});
test('each figure ages from its own evidence time at display',async()=>{
 const {ageOverview,BURN_TTL_MS,OVERVIEW_TTL_MS,BURN_MAX_STALE_MS,LIVE_COVERAGE_LAG_MS}=await import('../lib/public-overview.mjs');
 const t=Date.UTC(2026,9,23,13,0),iso=ms=>new Date(ms).toISOString();
 const data={burned:'130000000000000',burn:{checkedAt:iso(t),stale:false},volumeCoverage:'indexed',volumeIndexedThrough:iso(t)};
 assert.equal(ageOverview(data,t+BURN_TTL_MS+OVERVIEW_TTL_MS),data,'Unchanged within limits, same object.');
 const stale=ageOverview(data,t+BURN_TTL_MS+OVERVIEW_TTL_MS+1);
 assert.deepEqual(stale.burn,{checkedAt:iso(t),stale:true});assert.equal(stale.burned,'130000000000000');
 assert.deepEqual([ageOverview(data,t+BURN_MAX_STALE_MS+1).burned,ageOverview(data,t+BURN_MAX_STALE_MS+1).burn],[null,null]);
 for(const broken of [{...data,burn:null},{...data,burn:{checkedAt:'not a time',stale:true}}])assert.equal(ageOverview(broken,t).burned,null,'A burn without a usable read time is withheld.');
 assert.equal(ageOverview(data,t+LIVE_COVERAGE_LAG_MS).volumeCoverage,'indexed');
 assert.equal(ageOverview(data,t+LIVE_COVERAGE_LAG_MS+1).volumeCoverage,'partial');
 assert.equal(ageOverview({...data,volumeIndexedThrough:null},t).volumeCoverage,'partial');
 assert.equal(ageOverview(null,t),null);
});
