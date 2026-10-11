/** Adaptive quality for the decorative grain stage. Pure functions so the policy is testable without a canvas.
 * Level 0 is the full design; each step lowers grain count and/or frame rate. Levels only ever go up (worse) within a
 * session; the last level is a single static frame, the same as prefers-reduced-motion. */
export const GRAIN_LEVELS=Object.freeze([
 Object.freeze({share:1,fps:30}),
 Object.freeze({share:.6,fps:30}),
 Object.freeze({share:.6,fps:20}),
 Object.freeze({share:.35,fps:20}),
 Object.freeze({share:.35,fps:0}),
]);
export const STATIC_LEVEL=GRAIN_LEVELS.length-1;
/** A frame window is "over budget" when frames arrive more than 30% late on average, or when the stage's
 * own work takes more than 45% of the frame budget. Rasterisation is not visible to the work timer, so late frames are
 * the main signal on weak GPUs. Windows that include a pause (tab hidden, offscreen) never count. */
export function overBudget({frames,totalIntervalMs,totalWorkMs},fps){
 if(!frames||!fps)return false;
 const budget=1000/fps,interval=totalIntervalMs/frames,work=totalWorkMs/frames;
 return interval>budget*1.3||work>budget*.45;
}
/** Next level after a measured window of about one second; never lower than the current level. */
export function nextGrainLevel(level,window){
 const current=Math.max(0,Math.min(STATIC_LEVEL,level|0));
 if(current>=STATIC_LEVEL)return STATIC_LEVEL;
 return overBudget(window,GRAIN_LEVELS[current].fps)?current+1:current;
}
/** Frames per measuring window at a level: about one second of frames. */
export function windowFrames(level){const fps=GRAIN_LEVELS[Math.max(0,Math.min(STATIC_LEVEL,level|0))].fps;return fps?Math.round(fps):0;}
