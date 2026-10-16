/** Display-only data for the pan-and-zoom chart. Bars are quote per token from the index; the chart applies the metric
 * (price or market cap) and currency (quote or USD) as one multiplier when it draws, so switching never refetches. */
/** @type {ReadonlyArray<readonly [string,number]>} */
export const BAR_OPTIONS=Object.freeze([['1s',1],['1m',60],['5m',300],['15m',900],['1h',3600],['4h',14400],['1d',86400]]);
/** Range label, span in seconds (null: since the first trade), default bar size (null: chosen from the lifetime).
 * @type {ReadonlyArray<readonly [string,number|null,number|null]>} */
export const RANGE_OPTIONS=Object.freeze([['1D',86400,300],['1W',604800,3600],['1M',2592000,14400],['3M',7776000,86400],['1Y',31536000,86400],['All',null,null]]);
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;

/** Merge pages by bar time; a later page replaces the same bar (the newest read is the most complete). */
export function mergeBars(existing,incoming){
 const byTime=new Map(existing.map(bar=>[bar.time,bar]));
 for(const bar of incoming)if(Number.isFinite(bar.time)&&[bar.open,bar.high,bar.low,bar.close].every(positive))byTime.set(bar.time,bar);
 return [...byTime.values()].sort((a,b)=>a.time-b.time);
}

/** Fold streamed executions newer than the indexed tail into bars of `seconds`. A live trade carries no amount, so it
 * moves price only; its bar's indexed volume is kept and a new bar starts at zero volume. */
export function withLiveTrades(bars,events,seconds){
 const tail=bars.at(-1),cutoff=tail?.lastTime??(tail?tail.time+seconds-1:-Infinity);
 const fresh=events.filter(e=>Number.isFinite(e.time)&&positive(e.value)&&e.time>cutoff).sort((a,b)=>a.time-b.time||a.slot-b.slot);
 if(!fresh.length)return bars;
 const out=bars.slice();
 for(const event of fresh){
  const time=Math.floor(event.time/seconds)*seconds,last=out.at(-1);
  if(last&&last.time===time)out[out.length-1]={...last,high:Math.max(last.high,event.value),low:Math.min(last.low,event.value),close:event.value,lastTime:event.time,live:true};
  else if(!last||time>last.time)out.push({time,open:last?.close??event.value,high:Math.max(last?.close??event.value,event.value),low:Math.min(last?.close??event.value,event.value),close:event.value,volume:0,lastTime:event.time,live:true});
 }
 return out;
}

/** Series rows for the chart: values scaled by `multiplier`, volume by `volumeMultiplier`, times shifted to the
 * viewer's clock (the chart library draws UTC). */
export function seriesRows(bars,{multiplier=1,volumeMultiplier=1,shift=0}={}){
 const candles=[],volumes=[];
 for(const bar of bars){
  const [open,high,low,close]=[bar.open,bar.high,bar.low,bar.close].map(v=>v*multiplier);
  if(![open,high,low,close].every(positive))continue;
  const time=bar.time+shift;
  candles.push({time,open,high,low,close});
  volumes.push({time,value:Math.max(0,(Number(bar.volume)||0)*volumeMultiplier),up:close>=open});
 }
 return {candles,volumes};
}

/** Price-scale step for tiny token prices: four significant digits below the smallest value shown. */
export function minMoveFor(values){
 const smallest=Math.min(...values.filter(positive));
 if(!Number.isFinite(smallest))return 0.01;
 return Math.max(1e-18,10**(Math.floor(Math.log10(smallest))-4));
}

/** "UTC+3", "UTC−4:30", "UTC" for the viewer's offset in minutes east of UTC. */
export function utcLabel(minutesEast){
 if(!minutesEast)return 'UTC';
 const sign=minutesEast>0?'+':'−',abs=Math.abs(minutesEast),h=Math.floor(abs/60),m=abs%60;
 return `UTC${sign}${h}${m?`:${String(m).padStart(2,'0')}`:''}`;
}

/** `#rrggbb`, `#rgb` or `rgb(a)(…)` at a new alpha, as `rgba(…)`: the chart engine parses colors itself and does not
 * take `color-mix()`. Anything else comes back unchanged. */
export function withAlpha(color,alpha){
 const text=String(color||'').trim(),hex=/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
 if(hex){const h=hex[1].length===3?[...hex[1]].map(c=>c+c).join(''):hex[1];return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${alpha})`;}
 const rgb=/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(text);
 return rgb?`rgba(${rgb[1]},${rgb[2]},${rgb[3]},${alpha})`:text;
}

/** History paging by time window, not by row count: the server returns traded bars only, so a page with fewer bars
 * than asked for is not the end of history. `cursor` is the start of the oldest window read; history is complete once
 * it reaches the first trade (or there is no trade at all). A page without a window cannot be continued.
 * @param {number|null} previousCursor @param {{first?:number|null,window?:{start?:number}}} page
 * @returns {{cursor:number|null,exhausted:boolean}} */
export function pageCursor(previousCursor,page){
 const start=Number(page?.window?.start);
 if(!Number.isFinite(start))return {cursor:previousCursor,exhausted:true};
 const cursor=previousCursor==null?start:Math.min(previousCursor,start),first=page?.first??null;
 return {cursor,exhausted:first==null||cursor<=first};
}

/** Fit a quiet token's existing history on first open, instead of opening an empty recent window. */
export function chartLifetimeBar(first,current=300,now=Date.now()/1000,page=300){if(!Number.isFinite(first)||first<=0||first>now)return current;return BAR_OPTIONS.find(([,seconds])=>seconds>=current&&(now-first)/seconds<page)?.[1]??86400;}
