'use client';
import {GraduationCoverage} from "@/components/graduation-coverage";
import {useEffect,useState} from 'react';
import {SiteHeader} from './site-header';
import {SiteFooter} from './site-footer';
import {WxmrWarning} from './wxmr-warning';
type Proof={status:string;slot:number|null;checkedAt:string;quote:{symbol:string}|null;notice:string;accounts:{label:string;address:string;url:string}[];checks:{name:string;status:string;observed:unknown}[]};
/** A check's status as read from chain; anything other than PASS or FAIL is shown as not read. */
function CheckChip({status}:{status:string}){return <span className={`gx-chip ${status==='PASS'?'is-graduated':status==='FAIL'?'is-delayed':'is-quiet'}`}>{status==='PASS'?'pass':status==='FAIL'?'fail':'not read'}</span>;}
export default function LaunchProof({mint}:{mint:string}){const [proof,setProof]=useState<Proof|null>(null),[error,setError]=useState('');useEffect(()=>{const abort=new AbortController();fetch(`/api/proof/${encodeURIComponent(mint)}`,{signal:abort.signal}).then(async r=>{const d=await r.json() as Proof&{error?:string};if(!r.ok)throw Error(d.error||'Proof unavailable');setProof(d);}).catch(e=>{if(!abort.signal.aborted)setError(e instanceof Error?e.message:String(e));});return()=>abort.abort();},[mint]);
 return <main className="shell product-page proof-page"><SiteHeader/>
  <div className="product-breadcrumb"><a href={`/token/${mint}`}>Token market</a><a href={`/token/${mint}/receipt`}>Receipt</a><span>/ Proof</span></div>
  <div className="page-heading"><div><p className="eyebrow">ON-CHAIN LAUNCH RULES</p><h1>launch proof<span className="gx-dot">.</span></h1></div><a className="inline-link" href={`/token/${mint}`}>Back to token ↗</a></div>
  <section className="panel proof-card"><p className="address-line">Mint: {mint}</p>{error&&<p role="alert" className="feedback error">{error}</p>}
   {!proof&&!error?<p role="status">Reading finalized on-chain accounts…</p>:proof&&<>
    <div className="proof-verdict"><h2>{proof.status==='PASS'?'current rules satisfied':'rules not verified'}<span className="gx-dot">.</span></h2><CheckChip status={proof.status}/></div>
    <p className="proof-meta">Paired with {proof.quote?.symbol||'UNKNOWN'} · finalized slot <span className="gx-num">{proof.slot??'UNKNOWN'}</span> · read {new Date(proof.checkedAt).toISOString()}</p>
    <p className="setup-note">{proof.notice}</p>
    <dl className="proof-checks">{proof.checks.map((c,i)=><div key={i}><dt>{c.name}</dt><dd><CheckChip status={c.status}/></dd></div>)}</dl>
    <GraduationCoverage/>{proof.quote?.symbol==='wXMR'&&<WxmrWarning/>}
    <h2>accounts read<span className="gx-dot">.</span></h2>
    <div className="proof-accounts">{proof.accounts.map(a=><a className="proof-address" key={a.address} href={a.url} target="_blank" rel="noreferrer"><span>{a.label} ↗</span><code>{a.address}</code></a>)}</div>
    <a className="inline-link" href={`/api/proof/${mint}`}>Read the full proof JSON ↗</a></>}
  </section>
  <SiteFooter/></main>;}
