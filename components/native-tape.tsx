'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight} from 'lucide-react';
import {startViewerPolling} from '@/lib/viewer-polling.mjs';
import {formatAmount,relativeTime,shortAddress} from '@/lib/price-format';
import {tapeLedgerRows} from '@/lib/tape-ledger.mjs';
import {useQuotePrices} from '@/hooks/use-quote-prices';
import {derivedSolWxmr} from '@/lib/reward-credit-illustration.mjs';
/** `seq` is the event's position in the token's full indexed history. Integration point: the indexer does not
 * return it yet, so numbers are derived only once the whole history is loaded and are otherwise withheld.
 * `provisional` rows are confirmed but not yet finalized (PR #39 catch-up); they carry display amounts instead of raw units. */
export type TapeEvent={id:string;signature:string;kind:string;source:string;wallet:string;slot:number;blockTime:number|null;baseAmount?:string;quoteAmount?:string;baseDecimals?:number;quoteDecimals?:number;quoteSymbol?:string;seq?:number;provisional?:boolean;display?:{quote:number;tokens:number}};
export type TapeFeed={events:TapeEvent[];candles:{time:number;close:number}[];coverage:string;notice:string;quote:string;nextCursor:string|null};
export type TapeState={data:TapeFeed|null;error:string;updatedAt:number|null;pending:TapeEvent[]};
type TradeRow={id:string;signature:string;wallet:string;time:number;side:'buy'|'sell';tokens:number;quote:number;source?:string;provisional?:boolean};
/** One poll feeds the ledger. With `pending`, the page also asks /history for confirmed rows the finalized index has not
 * written yet; those stay visually separate and unnumbered. */
export function useNativeTape(mint:string,{pending=false}:{pending?:boolean}={}):TapeState{
 const [state,setState]=useState<TapeState&{key:string}>({key:'',data:null,error:'',updatedAt:null,pending:[]}),key=mint;
 useEffect(()=>startViewerPolling(async(signal:AbortSignal)=>{
  try{const r=await fetch(`/api/tape/${encodeURIComponent(mint)}?seconds=300`,{signal});if(!r.ok)throw Error('Indexed tape unavailable.');const data=await r.json() as TapeFeed;
   let rows:TapeEvent[]=[];
   if(pending){try{const h=await fetch(`/api/market/${encodeURIComponent(mint)}/history?kind=trades&interval=5m`,{signal,cache:'no-store',headers:{'X-Grainpad-Viewer':'visible'}});
    if(h.ok){const body=await h.json() as {rows?:TradeRow[];source?:string};const known=new Set(data.events.map(e=>e.signature));
     rows=(body.source===undefined||body.source==='grainpad'?body.rows||[]:[]).filter(t=>t.provisional&&!known.has(t.signature)).map(t=>({id:t.id,signature:t.signature,kind:t.side,source:t.source||'curve',wallet:t.wallet,slot:Number.MAX_SAFE_INTEGER,blockTime:t.time,quoteSymbol:data.quote,provisional:true,display:{quote:t.quote,tokens:t.tokens}}));}
   }catch{/* Finalized rows remain the ledger when catch-up is unavailable. */}}
   setState({key,data,error:'',updatedAt:Date.now(),pending:rows});}
  catch(e){if(!signal.aborted)setState(previous=>({...previous,key,error:e instanceof Error?e.message:'Indexed tape unavailable.'}));}
 },{intervalMs:30_000}),[key,mint,pending]);
 return state.key===key?state:{data:null,error:'',updatedAt:null,pending:[]};
}
const LABEL:Record<string,string>={buy:'Buy',sell:'Sell','fee-accrued':'Fee earned','fee-claimed':'Fee claimed',launch:'Launch',graduation:'Graduated'};
const SOURCE:Record<string,string>={curve:'curve',cpmm:'Raydium',lp:'locked LP'};
const PAGE=12;
type Props={mint:string;symbol?:string;feed?:TapeState};
export function NativeTape(props:Props){return <NativeTapeView key={props.mint} {...props}/>;}
function SelfFedTape(props:Props){const feed=useNativeTape(props.mint);return <Ledger {...props} feed={feed}/>;}
function NativeTapeView(props:Props){return props.feed?<Ledger {...props} feed={props.feed}/>:<SelfFedTape {...props}/>;}
function Ledger({mint,symbol,feed}:Props&{feed:TapeState}){
 const [older,setOlder]=useState<TapeEvent[]>([]),[cursor,setCursor]=useState<string|null|undefined>(undefined),[shown,setShown]=useState(PAGE),[loading,setLoading]=useState(false),[moreError,setMoreError]=useState(''),[filter,setFilter]=useState('all'),[now,setNow]=useState(()=>Date.now());
 const generation=useRef(0);
 useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),30_000);return()=>clearInterval(id);},[]);
 // Amounts read in SOL: the pool trades in its quote asset (wXMR), converted at the current SOL/wXMR rate.
 const {prices,now:priceNow}=useQuotePrices(),wxmrPerSol=derivedSolWxmr(prices,priceNow) as number|null;
 // Infinite scroll: reaching the end of the list loads the next records.
 const scroller=useRef<HTMLDivElement>(null),sentinel=useRef<HTMLLIElement>(null),loadMore=useRef<()=>void>(()=>{});
 const data=feed.data,next=cursor===undefined?data?.nextCursor??null:cursor;
 const {finalized:all,confirmed}=tapeLedgerRows(data?.events||[],older,feed.pending);
 const events=[...confirmed,...all].filter(e=>filter==='all'||filter==='trades'&&(e.kind==='buy'||e.kind==='sell')||filter==='fees'&&e.kind.startsWith('fee-'));
 async function earlier(){
  if(shown<events.length){setShown(n=>n+PAGE);return;}
  if(!next||loading)return;const current=++generation.current;setLoading(true);setMoreError('');
  try{const r=await fetch(`/api/tape/${encodeURIComponent(mint)}?before=${encodeURIComponent(next)}&seconds=300`);if(!r.ok)throw Error('Earlier records are unavailable.');const body=await r.json() as TapeFeed;if(current===generation.current){setOlder(previous=>[...previous,...body.events]);setCursor(body.nextCursor);setShown(n=>n+PAGE);}}
  catch(e){setMoreError(e instanceof Error?e.message:'Earlier records are unavailable.');}finally{setLoading(false);}
 }
 const hasMore=!!data&&(shown<events.length||!!next);
 useEffect(()=>{loadMore.current=()=>void earlier();});
 useEffect(()=>{
  const root=scroller.current,target=sentinel.current;if(!root||!target||!hasMore)return;
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))loadMore.current();},{root,rootMargin:'0px 0px 160px 0px'});
  observer.observe(target);return()=>observer.disconnect();
 },[hasMore,shown,events.length,loading]);
 return <section id="public-tape" className="panel corner-panel public-tape" aria-labelledby="tape-heading">
  <div className="corner-head"><span className="corner-label">Tape</span><span className="corner-label is-right">{data?`${all.length}${next?'+':''} finalized · ${confirmed.length} confirmed`:'indexed'}</span></div>
  <div className="tape-head"><h2 id="tape-heading" className="display-title">tape<span>.</span></h2><p>Observed trades and fees, curve to Raydium. Confirmed rows stay separate until the finalized index catches up.</p></div>
  <div className="segmented" role="group" aria-label="Event type">{[['all','All'],['trades','Trades'],['fees','Fees']].map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>{setFilter(value);setShown(PAGE);}}>{label}</button>)}</div>
  {feed.error&&!data&&<p role="status" className="ledger-empty">{feed.error}</p>}
  {!data&&!feed.error&&<p role="status" className="ledger-empty">Reading the ledger…</p>}
  {data&&(events.length?<div ref={scroller} className="ledger-scroll" tabIndex={0} aria-label="Indexed events, scroll for earlier records"><ol className="ledger" aria-label="Indexed events, newest first">{events.slice(0,shown).map(e=>{
   const side=e.kind==='buy'||e.kind==='sell'?e.kind:'event',time=e.blockTime?e.blockTime*1000:null;
   const sym=e.quoteSymbol||data.quote,onChain=e.display?e.display.quote:e.quoteAmount&&e.quoteDecimals!==undefined?Number(e.quoteAmount)/10**e.quoteDecimals:null;
   const inSol=onChain==null?null:sym==='SOL'?onChain:wxmrPerSol?onChain/wxmrPerSol:null;
   const quote=onChain==null?null:inSol!=null?`${sym==='SOL'?'':'≈ '}${formatAmount(inSol,3)} SOL`:`${formatAmount(onChain,3)} ${sym}`;
   const quoteTitle=onChain!=null&&sym!=='SOL'?`${formatAmount(onChain,4)} ${sym} on chain${inSol!=null?' · SOL at the current SOL/wXMR rate':''}`:undefined;
   const tokenCount=e.display?e.display.tokens:e.baseAmount&&e.baseDecimals!==undefined&&(e.kind==='buy'||e.kind==='sell')?Number(e.baseAmount)/10**e.baseDecimals:null;
   const tokens=tokenCount==null?null:`${formatAmount(tokenCount,3)}${symbol?` ${symbol}`:''}`;
   return <li key={e.id} className={`ledger-row is-${side}${e.provisional?' is-provisional':''}`}>
    <span className="ledger-side"><i aria-hidden="true"/>{LABEL[e.kind]||e.kind}{e.source!=='curve'&&SOURCE[e.source]?<small> · {SOURCE[e.source]}</small>:null}{e.provisional&&<small className="ledger-chip" title="Confirmed on chain; the finalized index has not written it yet">confirmed</small>}</span>
    <span className="ledger-amount" title={quoteTitle}>{quote||'—'}{tokens&&<small>{tokens}</small>}</span>
    <a className="ledger-wallet" href={`/creator/${e.wallet}`} title={e.wallet}>{shortAddress(e.wallet)}</a>
    <a className="ledger-time" href={`https://explorer.solana.com/tx/${e.signature}`} target="_blank" rel="noreferrer" title={time?new Date(time).toLocaleString():`Slot ${e.slot}`}>{time?relativeTime(time,now):`slot ${e.slot}`}<ArrowUpRight size={11} aria-hidden="true"/></a>
   </li>;})}
   <li ref={sentinel} className="ledger-sentinel" aria-live="polite">{hasMore?(loading?'Loading earlier records…':moreError?<button type="button" className="gx-ghost" onClick={()=>void earlier()}>Retry</button>:'Scroll for earlier records'):'Start of the indexed history'}</li></ol></div>:<p className="ledger-empty">{filter==='all'?'No finalized events yet. The first trade opens the ledger.':'No matching records in the loaded history.'}</p>)}
  {moreError&&<p role="status" className="ledger-empty">{moreError}</p>}
  {data&&<p className="ledger-foot">{data.coverage}{data.quote!=='SOL'&&wxmrPerSol?` · Amounts in SOL at the current SOL/${data.quote} rate; on-chain amounts are in ${data.quote} (hover a row).`:''}</p>}
 </section>;
}
