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
