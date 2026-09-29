"use client";
import {RulesBadge} from './rules-badge';
import {useEffect, useState} from 'react';
import {displayUnits} from '@/lib/token-units.mjs';

export type SiteOverviewData = {
 launches:number|null; volume:null; burned:string|null; checkedAt:string|null; stale:boolean; claimsValidUntil?:number;
 features:{pairedLaunches:boolean; onChainRules:boolean};
};

export function useSiteOverview() {
 const [data,setData] = useState<SiteOverviewData|null>(null);
 useEffect(() => {
  const abort = new AbortController();
  let busy = false;
  async function refresh() {
   if (busy || document.hidden) return;
   busy = true;
   try {
    const r = await fetch('/api/site-overview',{signal:abort.signal});
    if (!r.ok) throw Error();
    const next = await r.json() as SiteOverviewData;
    if (!abort.signal.aborted) setData(next);
   } catch {
    if (!abort.signal.aborted) setData(previous => previous ? {...previous,stale:true,features:{pairedLaunches:false,onChainRules:false}} : null);
   } finally {busy=false;}
  }
  void refresh();
  const timer = setInterval(refresh,30_000);
  document.addEventListener('visibilitychange',refresh);
  return () => {abort.abort();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
 },[]);
 useEffect(()=>{
  if(!data?.claimsValidUntil)return;
  const timer=setTimeout(()=>setData(previous=>previous?{...previous,features:{pairedLaunches:false,onChainRules:false}}:null),Math.max(0,data.claimsValidUntil-Date.now()));
  return()=>clearTimeout(timer);
 },[data?.claimsValidUntil]);
 return data;
}

export function SiteStats({data}:{data:SiteOverviewData|null}) {
 return <section className="site-stats" aria-label="Grainpad activity">
  <div className="stats-heading"><span className="overline">ON THE RECORD</span><span>{data?.stale?'Last known data':data?.checkedAt?'Verified records':'Data pending'}</span></div>
  <dl>
   <div><dt>Launches</dt><dd>{data?.launches?.toLocaleString('en-US') ?? '—'}</dd><small>Confirmed Grainpad launches</small></div>
   <div><dt>Trading volume</dt><dd>—</dd><small>Volume tracking is not available yet</small></div>
   <div><dt>GRAIN burned</dt><dd>{data?.burned == null ? '—' : displayUnits(data.burned,6)}</dd><a href="/treasury">Verified burn receipts</a></div>
  </dl>
  <p className="stats-note">{data?.checkedAt?`Updated ${new Date(data.checkedAt).toISOString().slice(11,16)} UTC. `:''}Only recorded activity is shown. A dash means data is not available.</p>
 </section>;
}

export function HeroFeatures({data}:{data:SiteOverviewData|null}) {
 if (!data || data.stale || !data.features.pairedLaunches || !data.features.onChainRules) return null;
 return <div className="hero-features"><span>Paired with wXMR</span><RulesBadge/></div>;
}
