'use client';
import {useEffect,useState} from 'react';
import {fromRaw} from '@/lib/crew.mjs';
type Payment={signature:string;asset:string;amountRaw:string;decimals:number;slot:number};
type Contribution={id:string;mint:string;title:string;url:string;created_at:number;need_title:string|null;credited:boolean;approved:boolean;payments:Payment[]};
/** Public contribution history for a wallet across every Room. */
export function CrewRecord({wallet}:{wallet:string}){
 const [rows,setRows]=useState<Contribution[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();fetch(`/api/crew/${wallet}`,{signal:c.signal,cache:'no-store'}).then(async r=>{const d=await r.json() as {contributions:Contribution[];error?:string};if(!r.ok)throw Error(d.error||'Contribution record unavailable.');setRows(d.contributions);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[wallet]);
 const approved=rows?.filter(r=>r.approved).length||0,paid=rows?.filter(r=>r.payments.length).length||0;
 const label=(p:Payment,mint:string)=>`${fromRaw(p.amountRaw,p.decimals)} ${p.asset===mint?'project token':p.asset}`;
 return <section className="panel product-panel crew-record" id="crew-record"><div className="product-section-heading"><div><p className="eyebrow">CREW RECORD</p><h2>work this wallet contributed<span className="gx-dot">.</span></h2><p>Signed contributions across Rooms, with the creator’s approvals and payments verified on-chain.</p></div></div>
 {error&&<p role="status">{error}</p>}{!rows&&!error&&<p role="status">Loading contributions…</p>}
 {rows&&<><div className="product-metrics"><div><span>Contributions</span><strong>{rows.length}</strong></div><div><span>Approved</span><strong>{approved}</strong></div><div><span>Paid · verified</span><strong>{paid}</strong></div><div><span>Credited</span><strong>{rows.filter(r=>r.credited).length}</strong></div></div>
 {rows.length?<div className="product-table-wrap"><table className="product-table"><thead><tr><th>Contribution</th><th>Task</th><th>Status</th><th>Payment</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><a href={`/token/${r.mint}/room`}>{r.title}</a><small>{new Date(r.created_at).toLocaleDateString()}</small></td><td>{r.need_title||'—'}</td><td>{r.approved?'Approved':'Submitted'}{r.credited?' · Credited':''}</td><td>{r.payments.length?r.payments.map(p=><a key={p.signature} href={`https://explorer.solana.com/tx/${p.signature}`} target="_blank" rel="noreferrer">{label(p,r.mint)} ↗</a>):r.approved?'Awaiting payment':'—'}</td></tr>)}</tbody></table></div>:<div className="product-empty"><h3>No contributions yet.</h3><p>Open a <a href="/rooms">Room</a>, pick a task and submit work. Your wallet signature is your credit.</p></div>}
 <p className="small muted">Approval and credit are creator statements. A payment appears only after grainpad checks a finalized transfer from the project creator’s wallet to this wallet.</p></>}</section>;
}
