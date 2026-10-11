'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {displayUnits} from '@/lib/token-units.mjs';
import {formatUnits} from '@/lib/price-format';
import type {exitScenarios} from '@/lib/reality-check.mjs';
type Result=ReturnType<typeof exitScenarios>&{mint:string;symbol:string;checkedAt:number;expiresAt:number;networkCost:string;notice:string};
type Props={mint:string;symbol:string;balance?:string;onUse?:(amount:string)=>void;compact?:boolean};
export function RealityCheck(props:Props){return <RealityCheckView key={props.mint} {...props}/>;}
function RealityCheckView({mint,symbol,balance,onUse,compact=false}:Props){
 const [amount,setAmount]=useState(''),[slippage,setSlippage]=useState('1'),[result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[now,setNow]=useState(()=>Date.now());
 const generation=useRef(0);
 useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[]);
 function edit(value:string,field:'amount'|'slippage'){generation.current++;setResult(null);setError('');(field==='amount'?setAmount:setSlippage)(value);}
 async function check(){const current=++generation.current;setBusy(true);setError('');setResult(null);try{const r=await fetch(`/api/reality-check/${mint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount,slippage})});const data=await r.json() as Result&{error?:string};if(!r.ok)throw Error(data.error||'Quote unavailable.');if(current===generation.current){setResult(data);setNow(Date.now());}}catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Quote unavailable.');}finally{setBusy(false);}}
 const expired=!!result&&now>=result.expiresAt;
 const body=<>
 <div className="product-input-row"><label>Position · {symbol}<Input value={amount} inputMode="decimal" placeholder="Token amount" onChange={e=>edit(e.target.value,'amount')}/></label><label>Slippage · %<Input value={slippage} inputMode="decimal" onChange={e=>edit(e.target.value,'slippage')}/></label><Button disabled={busy||!amount} onClick={()=>void check()}>{busy?'Reading reserves…':result?'Refresh check':'Check exit'}</Button>{balance&&<Button variant="outline" onClick={()=>edit(displayUnits(balance,6),'amount')}>Use wallet balance</Button>}</div>
 {error&&<p className="feedback error" role="alert">{error}</p>}
 {result&&<><p className={expired?'feedback':'small muted'} role="status">{expired?'Quote expired. Refresh before comparing proceeds.':`Checked ${new Date(result.checkedAt).toLocaleTimeString()} · ${Math.max(0,Math.ceil((result.expiresAt-now)/1000))}s remaining`} · {result.route==='cpmm'?'Raydium CPMM':'Bonding curve'}</p>
 {compact?<ul className="reality-rows">{result.scenarios.map(row=><li key={row.percent}><strong>Sell {row.percent}%</strong>{row.error?<span>{row.error}</span>:<><span>{formatUnits(row.output!,result.quote.decimals,4)} {result.quote.symbol}<small>after fees and tax</small></span><span>min {formatUnits(row.minimum!,result.quote.decimals,4)}<small>impact {row.priceImpactBps===null?'unavailable':`${(row.priceImpactBps!/100).toFixed(2)}%`}</small></span>{onUse&&<Button size="sm" variant="outline" disabled={expired} onClick={()=>onUse(displayUnits(row.input!,6))}>Use</Button>}</>}</li>)}</ul>
 :<div className="product-table-wrap"><table className="product-table"><thead><tr><th>Sell</th><th>Spot value</th><th>After fees and tax</th><th>Minimum at {result.slippageBps/100}%</th><th>Price impact</th><th/></tr></thead><tbody>{result.scenarios.map(row=><tr key={row.percent}><th>{row.percent}%</th>{row.error?<td colSpan={5}>{row.error}</td>:<><td>{displayUnits(row.spotValue!,result.quote.decimals)} {result.quote.symbol}</td><td>{displayUnits(row.output!,result.quote.decimals)} {result.quote.symbol}</td><td>{displayUnits(row.minimum!,result.quote.decimals)} {result.quote.symbol}</td><td>{row.priceImpactBps===null?'Unavailable':`${(row.priceImpactBps!/100).toFixed(2)}%`}</td><td>{onUse&&<Button size="sm" variant="outline" disabled={expired} onClick={()=>onUse(displayUnits(row.input!,6))}>Use in swap</Button>}</td></>}</tr>)}</tbody></table></div>}
 <details className="product-details"><summary>Fee breakdown and assumptions</summary>{result.scenarios.filter(r=>!r.error).map(r=><div key={r.percent}><strong>{r.percent}% sale</strong>{r.fees?.map(f=><p key={f.source}>{f.source.replace(/Fee$/,' fee')}: {displayUnits(f.amount,f.asset==='base'?6:result.quote.decimals)} {f.asset==='base'?symbol:result.quote.symbol}</p>)}</div>)}<p>{result.networkCost}</p><p>{result.notice}</p></details></>}
 {!result&&<p className="small muted">No wallet connection required. Pool fees are included; network costs are reviewed separately before a trade.</p>}</>;
 // Inside the swap module the check is a disclosure, not a separate top-level destination.
 if(compact)return <details className="swap-reality" id="reality-check"><summary><span>Reality Check</span><small>What would an exit return?</small></summary><div className="reality-check is-compact">{body}</div></details>;
 return <section className="panel product-panel reality-check" id="reality-check" aria-labelledby="reality-heading"><div className="product-section-heading"><div><p className="eyebrow">POSITION / EXIT</p><h2 id="reality-heading">reality check</h2><p>Compare the proceeds from selling a quarter, half or all of your token amount.</p></div><span className="product-tag">Read only</span></div>{body}</section>;
}
