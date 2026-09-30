'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight} from 'lucide-react';
import {startViewerPolling} from '@/lib/viewer-polling.mjs';
import {formatAmount,formatUnits,recordNumber,relativeTime,shortAddress} from '@/lib/price-format';
import {Button} from './ui/button';
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
 const data=feed.data,next=cursor===undefined?data?.nextCursor??null:cursor;
 const all=[...new Map([...(data?.events||[]),...older].map(e=>[e.id,e])).values()].sort((a,b)=>b.slot-a.slot||b.id.localeCompare(a.id));
 const complete=!!data&&next===null,numbered:TapeEvent[]=[...feed.pending,...all.map((e,i)=>({...e,seq:e.seq??(complete?all.length-i:undefined)}))];
 const events=numbered.filter(e=>filter==='all'||filter==='trades'&&(e.kind==='buy'||e.kind==='sell')||filter==='fees'&&e.kind.startsWith('fee-'));
 async function earlier(){
  if(shown<events.length){setShown(n=>n+PAGE);return;}
  if(!next||loading)return;const current=++generation.current;setLoading(true);setMoreError('');
  try{const r=await fetch(`/api/tape/${encodeURIComponent(mint)}?before=${encodeURIComponent(next)}&seconds=300`);if(!r.ok)throw Error('Earlier records are unavailable.');const body=await r.json() as TapeFeed;if(current===generation.current){setOlder(previous=>[...previous,...body.events]);setCursor(body.nextCursor);setShown(n=>n+PAGE);}}
  catch(e){setMoreError(e instanceof Error?e.message:'Earlier records are unavailable.');}finally{setLoading(false);}
 }
 return <section id="public-tape" className="panel corner-panel public-tape" aria-labelledby="tape-heading">
  <div className="corner-head"><span className="corner-label">Tape</span><span className="corner-label is-right">{data?`${all.length}${next?'+':''} records`:'indexed'}</span></div>
  <div className="tape-head"><h2 id="tape-heading" className="display-title">tape<span>.</span></h2><p>Every finalized trade and fee for this token, curve to Raydium, in one public ledger.</p></div>
  <div className="segmented" role="group" aria-label="Event type">{[['all','All'],['trades','Trades'],['fees','Fees']].map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>{setFilter(value);setShown(PAGE);}}>{label}</button>)}</div>
  {feed.error&&!data&&<p role="status" className="ledger-empty">{feed.error}</p>}
  {!data&&!feed.error&&<p role="status" className="ledger-empty">Reading the ledger…</p>}
  {data&&(events.length?<ol className="ledger" aria-label="Indexed events, newest first">{events.slice(0,shown).map(e=>{
   const side=e.kind==='buy'||e.kind==='sell'?e.kind:'event',time=e.blockTime?e.blockTime*1000:null;
   const quote=e.display?`${formatAmount(e.display.quote,3)} ${e.quoteSymbol||data.quote}`:e.quoteAmount&&e.quoteDecimals!==undefined?`${formatUnits(e.quoteAmount,e.quoteDecimals,3)} ${e.quoteSymbol||data.quote}`:null;
   const tokens=e.display?`${formatAmount(e.display.tokens,3)}${symbol?` ${symbol}`:''}`:e.baseAmount&&e.baseDecimals!==undefined&&(e.kind==='buy'||e.kind==='sell')?`${formatUnits(e.baseAmount,e.baseDecimals,3)}${symbol?` ${symbol}`:''}`:null;
   return <li key={e.id} className={`ledger-row is-${side}${e.provisional?' is-provisional':''}`}>
    <span className="ledger-seq" title={e.provisional?'Confirmed on chain; the finalized index has not written it yet':e.seq===undefined?'Numbered once the full history is loaded':undefined}>{e.provisional?'confirmed':e.seq===undefined?'#····':recordNumber(e.seq)}</span>
    <span className="ledger-side"><i aria-hidden="true"/>{LABEL[e.kind]||e.kind}{e.source!=='curve'&&SOURCE[e.source]?<small> · {SOURCE[e.source]}</small>:null}</span>
    <span className="ledger-amount">{quote||'—'}{tokens&&<small>{tokens}</small>}</span>
    <a className="ledger-wallet" href={`/creator/${e.wallet}`} title={e.wallet}>{shortAddress(e.wallet)}</a>
    <a className="ledger-time" href={`https://explorer.solana.com/tx/${e.signature}`} target="_blank" rel="noreferrer" title={time?new Date(time).toLocaleString():`Slot ${e.slot}`}>{time?relativeTime(time,now):`slot ${e.slot}`}<ArrowUpRight size={11} aria-hidden="true"/></a>
   </li>;})}</ol>:<p className="ledger-empty">{filter==='all'?'No finalized events yet. The first trade opens the ledger.':'No matching records in the loaded history.'}</p>)}
  {data&&(shown<events.length||next)&&<Button variant="outline" className="ledger-more" disabled={loading} onClick={()=>void earlier()}>{loading?'Loading…':'Earlier'}</Button>}
  {moreError&&<p role="status" className="ledger-empty">{moreError}</p>}
  {data&&<p className="ledger-foot">{data.coverage}</p>}
 </section>;
}
