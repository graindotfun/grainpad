"use client";
import {RulesBadge} from './rules-badge';
import {useEffect, useState} from 'react';
import {displayRecordedBurns,compactRecordedBurns,compactReportedVolume} from '@/lib/public-overview.mjs';

export type SiteOverviewData = {
 launches:number|null; volume:number|null; volumeCoverage?:string; volumeTokens?:number; burned:string|null; checkedAt:string|null; stale:boolean; claimsValidUntil?:number;
 features:{pairedLaunches:boolean; onChainRules:boolean};
};

export function useSiteOverview(initialData:SiteOverviewData|null=null) {
 const [data,setData] = useState<SiteOverviewData|null>(initialData);
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
 return <section className="site-stats" aria-label="grainpad activity">
  <div className="stats-heading"><span className="overline">ON THE RECORD</span><span>{data?.stale?'Last known data':data?.checkedAt?'Verified records':'Data pending'}</span></div>
  <dl>
   <div><dt>Launches</dt><dd>{data?.launches?.toLocaleString('en-US') ?? '—'}</dd><small>Confirmed grainpad launches</small></div>
   <div><dt>Trading volume · 24h</dt><dd title={data?.volume == null ? undefined : new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(data.volume)}>{data?.volume == null ? "Indexing" : compactReportedVolume(data.volume)}</dd><small>{data?.volume == null ? "Verified volume data is not available yet" : `Reported volume · ${data.volumeTokens ?? 0} tracked tokens${data.volumeCoverage==='partial'?' · partial coverage':''}`}</small></div>
   <div><dt>GRAIN burned</dt><dd title={data?.burned == null ? undefined : displayRecordedBurns(data.burned)} aria-label={data?.burned == null ? undefined : `${displayRecordedBurns(data.burned)} GRAIN burned`}>{data?.burned == null ? '—' : compactRecordedBurns(data.burned)}</dd><a href="/rewards#holder-receipts-title">Verified burn receipts</a></div>
  </dl>
  <p className="stats-note">{data?.checkedAt?`Updated ${new Date(data.checkedAt).toISOString().slice(11,16)} UTC. `:''}Only recorded activity is shown. A dash means data is not available.</p>
 </section>;
}

export function HeroFeatures({data}:{data:SiteOverviewData|null}) {
 if (!data || data.stale || !data.features.pairedLaunches || !data.features.onChainRules) return null;
 return <div className="hero-features"><span>Paired with wXMR</span><RulesBadge/></div>;
}
