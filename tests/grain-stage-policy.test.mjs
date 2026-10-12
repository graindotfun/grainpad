import test from 'node:test';
import assert from 'node:assert/strict';
import {GRAIN_LEVELS,STATIC_LEVEL,nextGrainLevel,overBudget,windowFrames} from '../lib/grain-stage-policy.mjs';
// Decorative canvas quality policy: no wallet, network or chain access is involved.
const window=(fps,interval,work)=>({frames:fps,totalIntervalMs:fps*interval,totalWorkMs:fps*work});
test('a capable device stays at the full design',()=>{
 assert.equal(nextGrainLevel(0,window(30,33.4,4)),0);
 assert.equal(nextGrainLevel(0,window(30,40,9)),0,'mild jitter under 1.3x the frame budget is tolerated');
});
test('sustained slow frames or heavy work step down one level at a time',()=>{
 assert.equal(nextGrainLevel(0,window(30,60,5)),1,'frames at half the target rate');
 assert.equal(nextGrainLevel(1,window(30,34,16)),2,'own work above 45% of the budget');
 assert.equal(nextGrainLevel(2,window(20,90,5)),3);
 assert.equal(nextGrainLevel(3,window(20,90,5)),STATIC_LEVEL);
});
test('levels never go back up and the static level is final',()=>{
 assert.equal(nextGrainLevel(2,window(20,50,1)),2);
 assert.equal(nextGrainLevel(STATIC_LEVEL,window(30,16,1)),STATIC_LEVEL);
 assert.equal(nextGrainLevel(-3,window(30,33,1)),0);
});
test('levels lower count or frame rate monotonically and end in one static frame',()=>{
 for(let i=1;i<GRAIN_LEVELS.length;i++){assert.ok(GRAIN_LEVELS[i].share<=GRAIN_LEVELS[i-1].share);assert.ok(GRAIN_LEVELS[i].fps<=GRAIN_LEVELS[i-1].fps);assert.ok(GRAIN_LEVELS[i].share<GRAIN_LEVELS[i-1].share||GRAIN_LEVELS[i].fps<GRAIN_LEVELS[i-1].fps);}
 assert.equal(GRAIN_LEVELS[STATIC_LEVEL].fps,0);assert.equal(windowFrames(STATIC_LEVEL),0);assert.equal(windowFrames(0),30);
 assert.equal(overBudget({frames:0,totalIntervalMs:0,totalWorkMs:0},30),false);
});
test('grain size follows the stage short side, and smaller stages draw more grains for their area',async()=>{
 const {grainScale,grainCount,GRAIN_COUNT_RANGE,GRAIN_MIN_SCALE}=await import('../lib/grain-stage-policy.mjs');
 assert.equal(grainScale(714,640),1);assert.equal(grainScale(350,320),GRAIN_MIN_SCALE);assert.equal(grainScale(0,0),1);
 assert.ok(grainScale(500,520)>GRAIN_MIN_SCALE&&grainScale(500,520)<1);
 const phone=grainCount(350,320),desktop=grainCount(714,619);
 assert.ok(phone>2200,'a phone stage draws more grains than the old fixed 2200');
 assert.ok(phone/(350*320)>desktop/(714*619)*2,'phone grains are denser per pixel');
 assert.equal(grainCount(0,300),GRAIN_COUNT_RANGE[0]);assert.equal(grainCount(4000,3000),GRAIN_COUNT_RANGE[1]);
});
