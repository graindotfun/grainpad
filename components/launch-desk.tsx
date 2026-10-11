'use client';
import '@/app/launch-desk.css';
import {useEffect,useState} from 'react';
import {ArrowUpRight,Check,Copy} from 'lucide-react';
import {watchOfficialContract} from '@/lib/official-ca-refresh.mjs';
import {REWARDS_DEPLOYMENT} from '@/lib/rewards-deployment.mjs';
import type {useLaunchStatus} from './use-launch-status';
export function LaunchDesk({status}:Pick<ReturnType<typeof useLaunchStatus>,'status'>){
 const [official,setOfficial]=useState<{mint:string|null;state:string}>({mint:null,state:'checking'}),[copied,setCopied]=useState(false),[copyError,setCopyError]=useState(false);
 useEffect(()=>watchOfficialContract({onResult:setOfficial}),[]);

 useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(false),2000);return()=>clearTimeout(timer);},[copied]);
 async function copy(){if(!official.mint)return;try{await navigator.clipboard.writeText(official.mint);setCopied(true);setCopyError(false);}catch{setCopyError(true);}}
 return <section className="launch-desk" aria-labelledby="launch-desk-title">
  <div className="launch-desk-heading"><div><p className="overline">GRAINPAD / THE NEXT CHAPTER</p><h2 id="launch-desk-title">From launch to public record.</h2></div><a href="/rewards">How rewards work <ArrowUpRight size={15}/></a></div>
  <div className="launch-desk-grid">
   <article data-state={status.state}><p className="launch-desk-label"><i/> PUBLIC LAUNCHES</p><h3 aria-live="polite">{status.label}</h3><p>{status.note}</p><a href={status.state==='open'?'/launch':'/platform'}>{status.state==='open'?'Create a token':'View launch status'} <ArrowUpRight size={16}/></a></article>
   <article data-state={official.mint?'published':official.state}><p className="launch-desk-label"><i/> OFFICIAL GRAIN</p><h3 aria-live="polite">{official.mint?'The official address is here.':official.state==='unavailable'?'Verification unavailable.':official.state==='checking'?'Checking the official record.':'The address appears at launch.'}</h3>{official.mint?<><code className="launch-desk-ca">{official.mint}</code><div className="launch-desk-actions"><button onClick={()=>void copy()} aria-label="Copy official GRAIN address">{copied?<Check size={14}/>:<Copy size={14}/>} {copied?'Copied':'Copy CA'}</button><a href={`/token/${official.mint}`}>Open GRAIN <ArrowUpRight size={16}/></a></div></>:<p>{official.state==='unavailable'?'The official record could not be read. No other address is substituted.':'This panel and the header update automatically after the confirmed launch is verified.'}</p>}<span role="status" className={copyError?'launch-desk-copy-error':'sr-only'}>{copyError?'Copy unavailable. Select the full address above.':copied?'Full official address copied.':''}</span></article>
  </div>
  <div className="launch-desk-allocation" aria-label="Approved allocation of converted transfer tax"><div><strong>{REWARDS_DEPLOYMENT.holdersBps/100}%</strong><span>Holders<span>To be paid in wXMR</span></span></div><div><strong>{REWARDS_DEPLOYMENT.grainBurnBps/100}%</strong><span>GRAIN<span>Buy-and-burn reserve</span></span></div><div><strong>{REWARDS_DEPLOYMENT.grainpadBps/100}%</strong><span>Platform<span>Before operating costs</span></span></div></div>
  <div className="launch-desk-foot"><p>From converted transfer tax. Rewards depend on collected revenue, liquidity and operating costs. The GRAIN share stays reserved until its burn path is active.</p><a href="/docs#monero-records">Monero proof, per launch <ArrowUpRight size={13}/></a></div>
 </section>;
}
