"use client";
import {RulesBadge} from './rules-badge';
import {useEffect, useRef, useState} from 'react';
import {displayRecordedBurns,compactRecordedBurns,compactReportedVolume,ageOverview} from '@/lib/public-overview.mjs';

export type SiteOverviewData = {
 launches:number|null; launchesAwaiting?:number|null; launchesUnresolved?:number|null; volume:number|null; volumeCoverage?:string; volumeTokens?:number; volumeIndexedThrough?:string|null; volumeSource?:string; burned:string|null; paid?:{wxmrRaw:string;decimals:number;payments:number;latestAt:string|null;usdPrice:number|null}|null;
 burn?:{source:'mint-supply';initialSupply:string;currentSupply:string;decimals:number;slot:number|null;checkedAt:string;stale:boolean}|null; servedAt?:string; checkedAt:string|null; stale:boolean; claimsValidUntil?:number;
 features:{pairedLaunches:boolean; onChainRules:boolean};
};

const REQUEST_TIMEOUT_MS=20_000,CLOCK_DISCONTINUITY_MS=5_000;
export function useSiteOverview(initialData:SiteOverviewData|null=null) {
 const [data,setData] = useState<SiteOverviewData|null>(initialData);
 // Evidence ages from the server's own time. Elapsed time is read from both the monotonic page clock and the
 // device clock, and the larger counts, so neither a paused page clock (system sleep) nor a device clock
 // change can make evidence younger. If the two disagree, or the page resumes from a freeze, the clocks are
 // not trusted at all: every time-limited figure is treated as expired until a fresh response re-anchors.
 // A snapshot counts from when its request began (server-rendered data: from navigation start), so a slow or
 // late response is never fresher than it was. Without a server time every figure is withheld.
 const anchor = useRef({servedAt:Date.parse(initialData?.servedAt??''),at:0,wall:NaN,suspect:false}),initialClaims = useRef(initialData?.claimsValidUntil);
 useEffect(() => {
  const abort = new AbortController();
  let busy = false;
  // Server-rendered data counts from navigation start on both clocks. The wall reference is the one the browser
  // fixed at navigation (performance.timeOrigin), never rebuilt here: a suspension before this effect then shows
  // as a clock disagreement. Without it the evidence is not trusted until a fresh response re-anchors.
  if (!Number.isFinite(anchor.current.wall)) {
   const origin = performance.timeOrigin;
   if (Number.isFinite(origin)) anchor.current.wall = origin; else anchor.current.suspect = true;
  }
  const serverNow = () => {
   const a = anchor.current, page = performance.now()-a.at, wall = Date.now()-a.wall;
   if (Math.abs(wall-page) > CLOCK_DISCONTINUITY_MS) a.suspect = true;
   return Number.isFinite(a.servedAt) && !a.suspect ? a.servedAt+Math.max(page,wall) : Infinity;
  };
  // Hero claims expire on the same server clock as every other figure (suspect or paused clocks included).
  const age = (value:SiteOverviewData|null) => {
   const now = serverNow(), next = ageOverview(value,now);
   return next && (next.features.pairedLaunches || next.features.onChainRules) && !(now < (next.claimsValidUntil ?? -Infinity)) ? {...next,features:{pairedLaunches:false,onChainRules:false}} : next;
  };
  // The claims deadline is a server time: it is scheduled on the anchored server clock (never the device clock),
  // rescheduled whenever the anchor changes, and rechecked when the timer fires.
  let claimsUntil = initialClaims.current, claimsTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleClaims = () => {
   clearTimeout(claimsTimer);
   if (!claimsUntil) return;
   claimsTimer = setTimeout(() => {setData(previous => age(previous));if (serverNow() < (claimsUntil ?? 0)) scheduleClaims();},Math.max(0,claimsUntil-serverNow()));
  };
  async function refresh() {
   if (busy || document.hidden) return;
   busy = true;
   const started = performance.now(), startedWall = Date.now(), request = new AbortController(), stop = () => request.abort();
   abort.signal.addEventListener('abort',stop);
   const timeout = setTimeout(stop,REQUEST_TIMEOUT_MS);
   try {
    const r = await fetch('/api/site-overview',{signal:request.signal});
    if (!r.ok) throw Error();
    const next = await r.json() as SiteOverviewData;
    // A response slower than the timeout is discarded, whatever it carries.
    const page = performance.now()-started, wall = Date.now()-startedWall;
    if (Math.max(page,wall) > REQUEST_TIMEOUT_MS || Math.abs(wall-page) > CLOCK_DISCONTINUITY_MS) throw Error('Late or discontinuous snapshot.');
    if (!abort.signal.aborted) {anchor.current={servedAt:Date.parse(next.servedAt??''),at:started,wall:startedWall,suspect:false};claimsUntil=next.claimsValidUntil;setData(age(next));scheduleClaims();}
   } catch {
    if (!abort.signal.aborted) setData(previous => previous ? age({...previous,stale:true,features:{pairedLaunches:false,onChainRules:false}}) : null);
   } finally {busy=false;clearTimeout(timeout);abort.signal.removeEventListener('abort',stop);}
  }
  // Retained figures keep aging while requests fail: a burn read is marked, then withheld at its limit.
  const ager = setInterval(() => setData(previous => age(previous)),15_000);
  const visible = () => {setData(previous => age(previous));scheduleClaims();void refresh();};
  // Page Lifecycle resume (after a freeze, when timers and possibly the page clock were paused).
  const resumed = () => {anchor.current.suspect = true;visible();};
  setData(previous => age(previous));
  scheduleClaims();
  void refresh();
  const timer = setInterval(refresh,30_000);
  document.addEventListener('visibilitychange',visible);
  document.addEventListener('resume',resumed);
  return () => {abort.abort();clearInterval(timer);clearInterval(ager);clearTimeout(claimsTimer);document.removeEventListener('visibilitychange',visible);document.removeEventListener('resume',resumed);};
 },[]);
 return data;
}

const utcTime=(iso:string)=>new Date(iso).toISOString().slice(11,16);

export function SiteStats({data}:{data:SiteOverviewData|null}) {
 return <section className="site-stats" aria-label="grainpad activity">
  <div className="stats-heading"><span className="overline">ON THE RECORD</span><span role="status" aria-live="polite">{data?.stale||data?.burn?.stale?'Last known data':data?.checkedAt?'Verified records':'Data pending'}</span></div>
  <dl>
   <div><dt>Trading volume · 24h</dt><dd title={data?.volume == null ? undefined : new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(data.volume)}>{data?.volume == null ? "Indexing" : compactReportedVolume(data.volume)}</dd><small>{data?.volume == null ? "Indexed trade data is not available yet" : `Indexed on-chain trades${data.volumeIndexedThrough?` through ${utcTime(data.volumeIndexedThrough)} UTC`:""} · ${data.volumeTokens ?? 0} launch${data.volumeTokens===1?"":"es"}${data.volumeCoverage==='partial'?' · some trades not yet indexed':''}`}</small></div>
   <div><dt>GRAIN burned</dt><dd title={data?.burned == null ? undefined : displayRecordedBurns(data.burned)} aria-label={data?.burned == null ? undefined : `${displayRecordedBurns(data.burned)} GRAIN burned`}>{data?.burned == null ? 'Unavailable' : compactRecordedBurns(data.burned)}</dd>{data?.burned != null && data.burn ? <small>{`${compactRecordedBurns(data.burn.initialSupply)} created · ${compactRecordedBurns(data.burn.currentSupply)} remain on chain${data.burn.stale?` · as of ${utcTime(data.burn.checkedAt)} UTC`:""}`}</small> : null}<a href="/rewards#holder-receipts-title">Verified burn receipts</a></div>
  </dl>
  <p className="stats-note">{data?.checkedAt?`Updated ${utcTime(data.checkedAt)} UTC. `:''}Only recorded activity is shown.</p>
 </section>;
}

export function HeroFeatures({data}:{data:SiteOverviewData|null}) {
 if (!data || data.stale || !data.features.pairedLaunches || !data.features.onChainRules) return null;
 return <div className="hero-features"><span>Paired with wXMR</span><RulesBadge/></div>;
}
