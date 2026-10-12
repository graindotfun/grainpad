/** Display-only price candles. Empty periods carry the last observed execution, explicitly marked. */
import {GRAIN_ORANGE} from './brand-colors.mjs';
export const DEFAULT_CHART_PREFERENCES=Object.freeze({type:'line',up:GRAIN_ORANGE,down:'#8c9698'});
export const candleSeconds=window=>window>=86400?300:window>=3600?60:window>=300?5:1;
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const color=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():null;
export function chartPreferences(value){
 let parsed;try{parsed=typeof value==='string'?JSON.parse(value):value;}catch{parsed=null;}
 return {type:parsed?.type==='candles'?'candles':'line',up:color(parsed?.up)||DEFAULT_CHART_PREFERENCES.up,down:color(parsed?.down)||DEFAULT_CHART_PREFERENCES.down};
}
/** @param {*} rows @param {*} events @param {number} multiplier @param {number} now @param {number} window @param {number} [step] @param {{time:number,close:number}|null} [anchor] */
export function chartCandles(rows,events,multiplier,now,window,step=candleSeconds(window),anchor=null){
 if(!positive(multiplier)||!positive(window)||!Number.isFinite(now)||!Number.isSafeInteger(step)||step<1)return [];
 const start=now-window,buckets=new Map();
 let previous=anchor&&anchor.time<=start&&positive(anchor.close*multiplier)?anchor.close*multiplier:null,sourceTime=anchor?.time??null;
 for(const row of [...rows].sort((a,b)=>a.time-b.time)){
  if(!Number.isFinite(row.time)||row.time>now||![row.open,row.high,row.low,row.close].every(positive)||row.high<Math.max(row.open,row.close)||row.low>Math.min(row.open,row.close))continue;
  const [open,high,low,close]=[row.open,row.high,row.low,row.close].map(value=>value*multiplier);if(![open,high,low,close].every(positive))continue;
  if(row.time+step<=start){previous=close;sourceTime=row.lastTime??row.time;continue;}
  buckets.set(Math.floor(row.time/step)*step,{...row,time:Math.floor(row.time/step)*step,open,high,low,close});
 }
 const ordered=[...new Map(events.map(event=>[event.id,event])).values()].filter(event=>Number.isFinite(event.time)&&positive(event.value)&&event.time>=start&&event.time<=now+5).sort((a,b)=>a.time-b.time||a.slot-b.slot||a.id.localeCompare(b.id));
 for(const event of ordered){
  const time=Math.floor(event.time/step)*step,row=buckets.get(time),price=event.value*multiplier;
  if(!positive(price))continue;
  if(row){
   const lastTime=row.lastTime??row.time+step-1;
   if(event.time<lastTime||event.time===lastTime&&(event.slot<(row.lastSlot??Infinity)||event.slot===(row.lastSlot??Infinity)&&event.id.localeCompare(row.lastId??'\uffff')<=0))continue;
   row.high=Math.max(row.high,price);row.low=Math.min(row.low,price);row.close=price;row.lastTime=event.time;row.lastSlot=event.slot;row.lastId=event.id;
  }else buckets.set(time,{time,open:price,high:price,low:price,close:price,lastTime:event.time,lastSlot:event.slot,lastId:event.id});
 }
 const result=[],end=Math.floor(now/step)*step;
 for(let time=Math.floor(start/step)*step;time<=end;time+=step){
  const row=buckets.get(time);
  if(row){const open=previous??row.open;result.push({...row,open,high:Math.max(row.high,open),low:Math.min(row.low,open),openFromPrevious:previous!==null});previous=row.close;sourceTime=row.lastTime??row.time;}
  else if(previous!==null)result.push({time,open:previous,high:previous,low:previous,close:previous,carried:true,sourceTime});
 }
 // A receipt's estimated block time can lead the browser clock by a few seconds.
 for(const row of [...buckets.values()].filter(row=>row.time>end).sort((a,b)=>a.time-b.time)){const open=previous??row.open;result.push({...row,open,high:Math.max(row.high,open),low:Math.min(row.low,open),openFromPrevious:previous!==null});previous=row.close;}
 return result;
}

export const LIFETIME=-1;
/** Candles select a bar duration; lines select a rolling time window; LIFETIME ("All") asks the server for the token's
 * whole trading life, and the server answers with the window and bar size it chose. */
export function chartRequest(seconds,type){
 if(seconds===LIFETIME)return {query:`interval=1h&range=all&bars=${type==='candles'?90:240}`,window:null,resolution:null,lifetime:true};
 const interval=seconds===86400?'1d':seconds===3600?'1h':seconds===300?'5m':'1m';
 if(seconds===0)return {query:'interval=1m&range=live',window:120,resolution:1};
 if(type==='candles')return {query:`interval=${interval}`,window:seconds*60,resolution:seconds};
 return {query:`interval=${seconds===86400?'5m':interval}&range=${interval}`,window:seconds,resolution:candleSeconds(seconds)};
}
