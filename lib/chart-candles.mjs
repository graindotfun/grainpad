/** Display-only candles. Quiet periods remain empty; every OHLC value comes from an execution. */
import {GRAIN_ORANGE} from './brand-colors.mjs';
export const DEFAULT_CHART_PREFERENCES=Object.freeze({type:'line',up:GRAIN_ORANGE,down:'#8c9698'});
export const candleSeconds=window=>window>=86400?300:window>=3600?60:window>=300?5:1;
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const color=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():null;
export function chartPreferences(value){
 let parsed;try{parsed=typeof value==='string'?JSON.parse(value):value;}catch{parsed=null;}
 return {type:parsed?.type==='candles'?'candles':'line',up:color(parsed?.up)||DEFAULT_CHART_PREFERENCES.up,down:color(parsed?.down)||DEFAULT_CHART_PREFERENCES.down};
}
export function chartCandles(rows,events,multiplier,now,window,step=candleSeconds(window)){
 if(!positive(multiplier)||!positive(window)||!Number.isFinite(now)||!Number.isSafeInteger(step)||step<1)return [];
 const start=now-window,buckets=new Map();
 for(const row of rows){
  if(!Number.isFinite(row.time)||row.time+step<=start||row.time>now||![row.open,row.high,row.low,row.close].every(positive)||row.high<Math.max(row.open,row.close)||row.low>Math.min(row.open,row.close))continue;
  const [open,high,low,close]=[row.open,row.high,row.low,row.close].map(value=>value*multiplier);if(![open,high,low,close].every(positive))continue;
  buckets.set(row.time,{...row,open,high,low,close});
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
 return [...buckets.values()].sort((a,b)=>a.time-b.time);
}
