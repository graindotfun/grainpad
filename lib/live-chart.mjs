/** Real observations only. A history gap is a break, never an inferred price ramp. */
export function chartHistoryPoints(rows,multiplier,{partial=false,seconds=300}={}){
 const points=[];let previous=null;
 for(const row of rows){
  const value=row.close*multiplier;if(!Number.isFinite(value)||value<=0||!Number.isFinite(row.time))continue;
  if(partial&&previous!==null&&row.time-previous>seconds*2)points.push({time:previous+seconds,value:null});
  points.push({time:row.time,value});previous=row.time;
 }
 return points;
}
export function liveChartPoints(events,multiplier,now,window=120){
 const sorted=[...new Map(events.map(event=>[event.id,event])).values()].filter(event=>Number.isFinite(event.time)&&Number.isFinite(event.value)&&event.value>0&&event.time<=now+5).sort((a,b)=>a.time-b.time||a.slot-b.slot||a.id.localeCompare(b.id));
 const start=now-window,prior=sorted.filter(event=>event.time<start).at(-1);
 const points=sorted.filter(event=>event.time>=start).map(event=>({time:event.time,value:event.value*multiplier}));
 if(prior)points.unshift({time:start,value:prior.value*multiplier});
 // Last verified execution persists while no new transaction arrives; no synthetic fluctuations.
 if(points.length&&points.at(-1).time<now)points.push({time:now,value:points.at(-1).value});
 return points;
}

/** A timeframe is a rolling duration, not a candle size. Known executions carry flat in quiet time. */
/** @param {*} rows @param {*} events @param {number} multiplier @param {number} now @param {number} window @param {{time:number,close:number}|null} [anchor] */
export function rollingChartPoints(rows,events,multiplier,now,window,anchor=null){
 const observations=[...(anchor?[anchor]:[]),...rows.map(row=>({time:row.lastTime??row.time,close:row.close})),...events.map(event=>({time:event.time,close:event.value}))]
  .filter(row=>Number.isFinite(row.time)&&Number.isFinite(row.close)&&row.close>0&&row.time<=now).sort((a,b)=>a.time-b.time);
 const ordered=observations,start=now-window,prior=ordered.filter(row=>row.time<=start).at(-1);
 const points=ordered.filter(row=>row.time>start).map(row=>({time:row.time,value:row.close*multiplier}));
 if(prior)points.unshift({time:start,value:prior.close*multiplier});
 if(points.length&&points.at(-1).time<now)points.push({time:now,value:points.at(-1).value});
 return points;
}
/** Monotone cubic segments: rounded turns pass through actual samples without price overshoot. */
export function smoothChartSegments(points){
 if(points.length<2)return [];
 const slopes=points.slice(1).map((p,i)=>p.x===points[i].x?0:(p.y-points[i].y)/(p.x-points[i].x));
 const tangents=points.map((_,i)=>{if(i===0)return slopes[0];if(i===points.length-1)return slopes.at(-1);const a=slopes[i-1],b=slopes[i];return a*b<=0?0:Math.sign(a)*Math.min(Math.abs(a),Math.abs(b),Math.abs((a+b)/2));});
 return points.slice(1).map((p,i)=>{const a=points[i],dx=(p.x-a.x)/3;return {x1:a.x+dx,y1:a.y+dx*tangents[i],x2:p.x-dx,y2:p.y-dx*tangents[i+1],x:p.x,y:p.y};});
}
