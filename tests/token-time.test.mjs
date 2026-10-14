import test from 'node:test';
import assert from 'node:assert/strict';
import {NEW_TOKEN_WINDOW_MS,parseTimestamp,isNewLaunch,formatDuration,formatRelativeTime,graduationTiming,formatExactUtc,nextTimeBoundary} from '../lib/token-time.ts';
const now=Date.parse('2026-10-14T12:00:00.000Z'),iso=ms=>new Date(ms).toISOString();
const MIN=60_000,HOUR=3_600_000,DAY=86_400_000;
test('NEW window is one configurable 12-hour constant',()=>assert.equal(NEW_TOKEN_WINDOW_MS,12*HOUR));
test('NEW holds just before the boundary and ends exactly at 12 hours',()=>{
 const launch=now-NEW_TOKEN_WINDOW_MS;
 assert.equal(isNewLaunch(iso(launch+1),now),true,'1ms before');
 assert.equal(isNewLaunch(iso(launch),now),false,'exactly at 12h');
 assert.equal(isNewLaunch(iso(launch-1),now),false,'after');
 assert.equal(isNewLaunch(iso(now),now),true,'launched this instant');
 assert.equal(isNewLaunch(iso(now-HOUR),now,HOUR*2),true,'custom window');
});
test('missing, invalid and future launch times are never new',()=>{
 for(const bad of [undefined,null,'',' ','garbage','2026-10-14','2026-10-14T11:00:00',0,-5,NaN,Infinity,{},[]])assert.equal(isNewLaunch(bad,now),false,String(bad));
 assert.equal(isNewLaunch(iso(now+1),now),false);assert.equal(isNewLaunch(iso(now+DAY),now),false);
});
test('timestamps compare as absolute times regardless of zone notation',()=>{
 assert.equal(parseTimestamp('2026-10-14T14:00:00+02:00'),now);assert.equal(parseTimestamp('2026-10-14T12:00:00Z'),now);assert.equal(parseTimestamp(now),now);
 assert.equal(isNewLaunch('2026-10-14T13:00:00+02:00',now),true);assert.equal(isNewLaunch('2026-10-13T20:00:00-04:00',now),false);
});
test('duration formats',()=>{
 assert.equal(formatDuration(0),'<1m');assert.equal(formatDuration(59_999),'<1m');assert.equal(formatDuration(12*MIN),'12m');assert.equal(formatDuration(2*HOUR+34*MIN),'2h 34m');assert.equal(formatDuration(2*HOUR),'2h');
 assert.equal(formatDuration(DAY+4*HOUR),'1d 4h');assert.equal(formatDuration(3*DAY),'3d');
 for(const bad of [-1,NaN,Infinity])assert.equal(formatDuration(bad),null);
});
test('relative time describes time since the event',()=>{
 const ago=ms=>formatRelativeTime(iso(now-ms),now);
 assert.equal(ago(10_000),'just now');assert.equal(ago(MIN),'1 minute ago');assert.equal(ago(24*MIN),'24 minutes ago');assert.equal(ago(3*HOUR),'3 hours ago');assert.equal(ago(8*DAY),'8 days ago');
 assert.equal(ago(21*DAY),'3 weeks ago');assert.equal(ago(90*DAY),'3 months ago');assert.equal(ago(800*DAY),'2 years ago');
 assert.equal(formatRelativeTime(iso(now+30_000),now),'just now','small clock skew');assert.equal(formatRelativeTime(iso(now+HOUR),now),null);assert.equal(formatRelativeTime('nope',now),null);
});
test('graduation timing: duration is launch to graduation, ago is graduation to now',()=>{
 const launched=iso(now-8*DAY-2*HOUR-34*MIN),graduated=iso(now-8*DAY);
 const t=graduationTiming({launchedAt:launched,graduatedAt:graduated,now});
 assert.equal(t.duration,'2h 34m');assert.equal(t.ago,'8 days ago');assert.equal(t.exact,formatExactUtc(graduated));assert.equal(t.iso,graduated);
});
test('graduation timing never fabricates or accepts bad values',()=>{
 const g=iso(now-3*HOUR);
 assert.deepEqual(graduationTiming({graduatedAt:null,launchedAt:iso(now-DAY),now}),{duration:null,ago:null,exact:null,iso:null},'missing graduation time');
 const onlyAgo=graduationTiming({graduatedAt:g,launchedAt:null,now});assert.equal(onlyAgo.duration,null);assert.equal(onlyAgo.ago,'3 hours ago');
 const reversed=graduationTiming({graduatedAt:g,launchedAt:iso(now),now});assert.equal(reversed.duration,null,'negative duration rejected');assert.equal(reversed.ago,'3 hours ago');
 assert.equal(graduationTiming({graduatedAt:iso(now+DAY),launchedAt:iso(now-DAY),now}).ago,null,'future graduation');
 assert.equal(graduationTiming({graduatedAt:'garbage',launchedAt:iso(now-DAY),now}).duration,null);
 assert.equal(graduationTiming({graduatedAt:g,launchedAt:g,now}).duration,'<1m');
});
test('next boundary is the soonest future NEW expiry',()=>{
 const a=now-11*HOUR,b=now-HOUR,old=now-20*HOUR;
 assert.equal(nextTimeBoundary(now,[b,a,old,null]),a+NEW_TOKEN_WINDOW_MS);assert.equal(nextTimeBoundary(now,[old,null]),null);
});
