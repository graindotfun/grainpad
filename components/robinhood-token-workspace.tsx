'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from './ui/button';
import {RobinhoodMainnetMarket} from './robinhood-mainnet-market';
import {RobinhoodMainnetHistory} from './robinhood-mainnet-history';
import {robinhoodDisplayMarket,robinhoodDisplayUnits,type RobinhoodDisplayMarket} from '@/lib/chain/robinhood-market-display.ts';
import type {MainnetLaunchRecord} from '@/lib/chain/robinhood-mainnet-registration.ts';
/** Same market/tape/swap grid as Solana. Public figures never enter wallet quote state. */
export function RobinhoodTokenWorkspace({record,admitted}:{record:MainnetLaunchRecord;admitted:boolean}){
 const [snapshot,setSnapshot]=useState<RobinhoodDisplayMarket|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[sheet,setSheet]=useState(false),[tradeBusy,setTradeBusy]=useState(false),[side,setSide]=useState<'buy'|'sell'>('buy'),[historyRevision,setHistoryRevision]=useState(0);
 const pendingRead=useRef<AbortController|null>(null);
 async function read(signal?:AbortSignal){
  if(!admitted)return;pendingRead.current?.abort();const controller=new AbortController();pendingRead.current=controller;if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',()=>controller.abort(),{once:true});signal=controller.signal;
  setLoading(true);setError('');setSnapshot(null);
  try{const response=await fetch('/api/robinhood/mainnet/market?token='+encodeURIComponent(record.tokenAddress),{signal});if(!response.ok)throw Error('Market figures are temporarily unavailable. Retry shortly.');const next=robinhoodDisplayMarket(await response.json(),record);if(!signal?.aborted)setSnapshot(next);}
  catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:'Market figures unavailable.');}finally{if(!signal?.aborted)setLoading(false);}
 }
 useEffect(()=>{if(!admitted)return;const controller=new AbortController();void Promise.resolve().then(()=>{if(!controller.signal.aborted)return read(controller.signal);});return()=>{controller.abort();pendingRead.current?.abort();};
 // One bounded public read per navigation; manual refresh never requests a wallet.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[record.tokenAddress,admitted]);
 useEffect(()=>{
  if(!sheet)return;const before=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow,panel=document.getElementById('robinhood-swap');document.body.style.overflow='hidden';panel?.focus();
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setSheet(false);return;}if(event.key!=='Tab'||!panel)return;const items=[...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')].filter(el=>el.getClientRects().length>0);if(!items.length){event.preventDefault();return;}const first=items[0],last=items.at(-1)!;if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel)){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===panel)){event.preventDefault();first.focus();}};
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;before?.focus();};
 },[sheet]);
 useEffect(()=>{const media=window.matchMedia('(max-width:760px)');const change=()=>{if(!media.matches)setSheet(false);};media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 function open(direction:'buy'|'sell'){if(tradeBusy)return;setSide(direction);setSheet(true);}
 const stats=[['Market cap','—'],['Pool WETH',snapshot?robinhoodDisplayUnits(snapshot.realQuote):'—'],['24h volume','—'],['Pair','WETH']];
 return <><div className="token-layout"><div className="token-main">
  <section className="panel corner-panel market-module" aria-labelledby="market-heading"><div className="corner-head"><span className="corner-label">grainpad native · Robinhood Chain</span><span className="corner-label is-right">on-chain · WETH</span></div>
   <div className="market-headline"><div><h2 id="market-heading" className="sr-only">market</h2><p className="market-price"><span className="market-metric-toggle">Price <strong>—</strong></span></p><p className="small muted">{snapshot?.continuous?'Uniswap v3 · launch liquidity permanently locked':loading?'Reading the pool…':admitted?'Verified price history unavailable':'Launch verification pending'}</p></div><Button variant="outline" size="sm" disabled={loading||!admitted} onClick={()=>void read()}>{loading?'Reading…':'Refresh market'}</Button></div>
   <dl className="market-stats">{stats.map(([label,value])=><div className="market-stat" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
   <div className="market-chart-frame"><div className="market-empty" role="status"><strong>{!admitted?'Launch verification pending':error?'Market figures unavailable':'Price history unavailable'}</strong><span>{error||'Verified Robinhood history is required to draw this chart. Missing prices are never drawn as zero.'}</span></div></div>
   <div className="market-foot"><span>{snapshot?'Read from Robinhood Chain at block '+BigInt(snapshot.block).toString():'Robinhood Chain · WETH pair'} · USD conversion and 24h figures unavailable</span></div>
  </section>
  <RobinhoodMainnetHistory record={record} enabled={admitted} refreshKey={historyRevision}/>
  <section className="panel corner-panel"><div className="corner-head"><span className="corner-label">About this launch</span></div><h2>{record.name}</h2><p className="small muted">Token identity is bound on Robinhood Chain. Monero launch provenance is checked separately; trading and balances remain on Robinhood Chain.</p></section>
 </div><aside className="token-side">{sheet&&<button className="sheet-backdrop" aria-label="Close swap overlay" onClick={()=>setSheet(false)}/>}
  {admitted?<RobinhoodMainnetMarket record={record} embedded sheetOpen={sheet} onClose={()=>setSheet(false)} preferredSide={side} snapshot={snapshot} onBusyChange={setTradeBusy} onHistoryRefresh={()=>setHistoryRevision(n=>n+1)}/>:<section className="panel corner-panel token-swap rh-verification-pending"><div className="corner-head"><span className="corner-label">Swap · Robinhood Chain</span></div><p role="status">Monero registration is not currently verified. Trading opens after fresh verification.</p><a href={'/launch/robinhood/mainnet?recover='+record.transactionHash}>Recover this launch</a></section>}
 </aside></div>
 <div className="mobile-trade-bar" aria-label="Trade on Robinhood Chain"><Button disabled={!admitted||tradeBusy} onClick={()=>open('buy')}>Buy {record.symbol}</Button><Button variant="outline" disabled={!admitted||tradeBusy} onClick={()=>open('sell')}>Sell</Button></div></>;
}
