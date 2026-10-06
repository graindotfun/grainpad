'use client';
import {useEffect,useState} from 'react';
import {startViewerPolling} from '@/lib/viewer-polling.mjs';
import {ledgerFreshness} from '@/lib/authority-ledger-freshness.mjs';

type Holder={address:string|null;label:string;kind:string}|null;
type Evidence={type:'on-chain';account:string;field:string;links:{label:string;url:string}[];expected:unknown;observed:unknown}|{type:'declared'};
type Item={id:string;title:string;holder:Holder;controls:string;canMoveFunds:boolean;scope:string;note:string|null;evidence:Evidence;status:'matches-published'|'differs'|'observed'|'unavailable'|'declared'};
type Curve={mint:string;pool:string;links:{label:string;url:string}[];status:string;graduated:boolean;taxBasisPoints:number|null;taxRate:Holder;withdraw:Holder;mintAuthority:Holder;freezeAuthority:Holder;scheduledChange:boolean|null;read:boolean};
type Section={id:string;title:string;summary:string;items:Item[];curves?:Curve[];curveDiscovery?:{source:string;complete:boolean;count?:number}};
type Ledger={schema:string;genesisVerified:boolean;observedAt:number|null;slot:number|null;epoch:number|null;source:string|null;counts:Record<string,number>;warnings:string[];sections:Section[]};
type Response={ledger?:Ledger;stale?:boolean;error?:string}|null;

const STATUS:Record<Item['status'],string>={
 'matches-published':'Read on chain · matches published setting',
 differs:'Read on chain · DIFFERS from published setting',
 observed:'Read on chain',
 unavailable:'Not read',
 declared:'Grainpad statement · not read on chain',
};
const short=(a:string)=>`${a.slice(0,4)}…${a.slice(-4)}`;
const show=(v:unknown)=>v===null?'none (revoked)':v===undefined?'—':typeof v==='string'&&v.length>=32?short(v):String(v);

function HolderCell({holder,hidden}:{holder:Holder;hidden:boolean}){
 if(hidden)return <span className="ledger-muted">Hidden until a fresh read succeeds</span>;
 if(!holder)return <span className="ledger-muted">Not read</span>;
 return <span className={`ledger-holder ledger-holder-${holder.kind}`}><strong>{holder.label}</strong>{holder.address&&<code title={holder.address}>{holder.address}</code>}</span>;
}

function ItemRow({item,freshness}:{item:Item;freshness:string}){
 const onChain=item.evidence.type==='on-chain',hidden=onChain&&freshness==='failed';
 const status=hidden?'unavailable':item.status;
 return <article className={`ledger-item ledger-${status}${onChain&&freshness==='stale'?' ledger-stale':''}`}>
  <header><h3>{item.title}</h3><span className="ledger-status">{hidden?'Read failed · not shown':STATUS[status]}{onChain&&freshness==='stale'&&!hidden?' · STALE':''}</span></header>
  <dl>
   <div><dt>Held by</dt><dd><HolderCell holder={item.holder} hidden={hidden}/></dd></div>
   <div><dt>What it can do</dt><dd>{item.controls}</dd></div>
   <div><dt>Can move or redirect funds</dt><dd>{item.canMoveFunds?'Yes':'No'}</dd></div>
   <div><dt>Applies to</dt><dd>{item.scope}</dd></div>
   {item.evidence.type==='on-chain'&&!hidden&&<div><dt>Evidence</dt><dd><code>{item.evidence.field}</code> on <code title={item.evidence.account}>{short(item.evidence.account)}</code>{item.evidence.expected!==null&&item.evidence.expected!==undefined&&<> · published {show(item.evidence.expected)} · observed {show(item.evidence.observed)}</>}
    <span className="ledger-links">{item.evidence.links.map(l=><a key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.label}</a>)}</span></dd></div>}
   {item.note&&!hidden&&<div><dt>Note</dt><dd>{item.note}</dd></div>}
  </dl>
 </article>;
}

function Curves({section,freshness}:{section:Section;freshness:string}){
 if(!section.curves)return null;
 if(freshness==='failed')return <p className="ledger-muted">Curve authorities are hidden until a fresh read succeeds.</p>;
 return <div className="ledger-curves">
  <p className="ledger-muted">Discovery: {section.curveDiscovery?.source}{section.curveDiscovery?.complete?'':' — list may be incomplete'}. For an independent full scan run <code>SOLANA_RPC_URL=… node scripts/watch-authorities.mjs</code>.</p>
  <div className="ledger-table-wrap" role="region" aria-label="Existing curves" tabIndex={0}><table className="ledger-table">
   <thead><tr><th scope="col">Mint</th><th scope="col">State</th><th scope="col">Tax</th><th scope="col">Tax-rate authority</th><th scope="col">Tax withdrawal</th><th scope="col">Mint / freeze</th></tr></thead>
   <tbody>{section.curves.map(c=><tr key={c.mint}>
    <td><code title={c.mint}>{short(c.mint)}</code> {c.links.map(l=><a key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.label}</a>)}</td>
    <td>{c.status}</td><td>{c.taxBasisPoints===null?'—':`${c.taxBasisPoints/100}%`}{c.scheduledChange?' · CHANGE SCHEDULED':''}</td>
    <td>{c.taxRate?.label??'Not read'}</td><td>{c.withdraw?.label??'Not read'}</td>
    <td>{c.mintAuthority&&c.freezeAuthority?`${c.mintAuthority.kind==='revoked'?'revoked':'PRESENT'} / ${c.freezeAuthority.kind==='revoked'?'revoked':'PRESENT'}`:'Not read'}</td>
   </tr>)}</tbody>
  </table></div>
 </div>;
}

export function AuthorityLedgerView(){
 const [response,setResponse]=useState<Response>(null),[loaded,setLoaded]=useState(false),[now,setNow]=useState(0);
 useEffect(()=>{
  const stop=startViewerPolling(async(signal:AbortSignal)=>{
   try{const r=await fetch('/api/authority',{cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});const body=await r.json().catch(()=>null) as {ledger?:Ledger;stale?:boolean}|null;setResponse(r.ok&&body?body:{ledger:body?.ledger,error:'read-failed'});}
   catch{if(!signal.aborted)setResponse({error:'read-failed'});}
   finally{if(!signal.aborted){setLoaded(true);setNow(Date.now());}}
  },{intervalMs:60000});
  const timer=setInterval(()=>setNow(Date.now()),15000);
  return()=>{stop();clearInterval(timer);};
 },[]);
 if(!loaded)return <p className="ledger-muted" aria-live="polite">Reading finalized chain state…</p>;
 const freshness=ledgerFreshness(response,now),ledger=response?.ledger;
 return <div className="ledger" aria-live="polite">
  <div className={`ledger-banner ledger-banner-${freshness.state}`}>
   {freshness.state==='fresh'&&ledger?<p>Read at finalized slot {ledger.slot} (epoch {ledger.epoch}), {new Date(ledger.observedAt??0).toISOString()} · {ledger.source}. Every on-chain value links to an explorer so you can check it yourself.</p>:<p><strong>{freshness.message}</strong>{ledger?.observedAt&&freshness.state==='stale'?` Last read: ${new Date(ledger.observedAt).toISOString()}, slot ${ledger.slot}.`:''}</p>}
   {ledger&&freshness.state!=='failed'&&ledger.warnings.length>0&&<ul className="ledger-warnings">{ledger.warnings.map(w=><li key={w}>{w}</li>)}</ul>}
  </div>
  {(ledger?.sections??[]).map(section=><section key={section.id} className="ledger-section" aria-labelledby={`ledger-${section.id}`}>
   <div className="ledger-section-head"><h2 id={`ledger-${section.id}`}>{section.title}</h2><p>{section.summary}</p></div>
   <div className="ledger-items">{section.items.map(item=><ItemRow key={item.id} item={item} freshness={freshness.state}/>)}</div>
   <Curves section={section} freshness={freshness.state}/>
  </section>)}
 </div>;
}
