'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,ArrowRight,Search,Copy,Check,ChevronLeft,ChevronRight,RefreshCw,Sprout,X} from 'lucide-react';
import {Input} from './ui/input';
import {Button} from './ui/button';
import {GrainSelect} from './grain-select';
import {TokenImage} from './token-image';
import {BRAND_ASSETS} from '@/lib/brand-assets';
import {grainImpersonation} from '@/lib/launch-identity.mjs';
import {formatMarketCap,formatChange} from '@/lib/token-market';
import {startViewerPolling} from '@/lib/viewer-polling.mjs';
import type {DiscoveryResult,DiscoveryToken,DiscoveryFilter,DiscoverySort} from '@/lib/token-discovery';
const QUOTE_OPTIONS=[{value:'all',label:'All quote markets'},{value:'SOL',label:'SOL'},{value:'wXMR',label:'wXMR'}];
const SORT_OPTIONS=[{value:'newest',label:'Newest'},{value:'oldest',label:'Oldest'},{value:'market-cap',label:'Market cap'},{value:'volume',label:'24h volume'}];
function age(date:string){const elapsed=Math.max(0,Date.now()-Date.parse(date)),minutes=Math.floor(elapsed/60000);return minutes<1?'Just now':minutes<60?`${minutes}m ago`:minutes<1440?`${Math.floor(minutes/60)}h ago`:`${Math.floor(minutes/1440)}d ago`;}
/** `sparkline` is an integration point: #39 does not return a per-row price series yet, so cards draw a dashed baseline. */
type CardToken=DiscoveryToken&{sparkline?:number[]|null};
function Sparkline({points}:{points?:number[]|null}){
 const values=(points||[]).filter(v=>Number.isFinite(v));
 if(values.length<2)return <svg className="dc-spark is-empty" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="20" x2="100" y2="20"/></svg>;
 const min=Math.min(...values),max=Math.max(...values),range=max-min||1,step=100/(values.length-1);
 const line=values.map((v,i)=>`${(i*step).toFixed(2)},${(25-(v-min)/range*22).toFixed(2)}`).join(' ');
 return <svg className="dc-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><polyline points={line} vectorEffect="non-scaling-stroke"/></svg>;
}
function DiscoveryCard({token,roomMode=false}:{token:CardToken;roomMode?:boolean}){
 const [copied,setCopied]=useState(false),[copyError,setCopyError]=useState(false);
 const lifecycle=token.lifecycle==='raydium_live'?'Graduated':token.lifecycle==='migration_pending'?'Migrating':token.lifecycle==='curve_complete'?'Curve complete':token.state==='curve'&&token.progress!==null&&token.progress>=80?'Near graduation':null;
 const progress=token.state==='graduated'?100:token.progress;
 return <article className={`discovery-card dc is-${token.state} ${token.official?'is-grain':''}`}>
 <a className="dc-main" href={`/token/${token.mint}${roomMode?'/room':''}`} aria-label={`Open ${token.name} ${roomMode?'Room':'token market'}`}>
  <div className="dc-top"><TokenImage src={token.official?BRAND_ASSETS.token:token.image} symbol={token.symbol} size={56}/><div className="dc-id"><h3 title={token.name}>{token.name}</h3><p>${token.symbol} · {token.quoteAsset||'SOL'}</p></div>{token.official?<span className="record-tape">Official</span>:lifecycle&&<span className="record-tape">{lifecycle}</span>}</div>
  {grainImpersonation(token)?<p className="discovery-caution">Not the official GRAIN</p>:null}
  <div className="dc-value"><span>{token.state==='curve'||token.state==='graduating'?'Curve MC':'MC'}{token.figuresSource==='geckoterminal'?' · GeckoTerminal':''}</span><strong>{formatMarketCap(token.marketCapUsd)}</strong>{token.change24h!==null&&<small className={token.change24h>=0?'is-up':'is-down'}>{formatChange(token.change24h)}</small>}</div>
  <Sparkline points={token.sparkline}/>
  <div className="dc-progress">{progress!==null?<><div className="progress-track" role="progressbar" aria-label={`Graduation progress for ${token.symbol}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-valuetext={token.state==='graduated'?'Graduated to Raydium':`${progress}% raised toward graduation`}><i style={{transform:`scaleX(${progress/100})`}}/></div><span>{token.state==='graduated'?'On Raydium':`${Math.round(progress)}%`}</span></>:<span className="dc-unknown">Curve not read yet</span>}</div>
 </a>
 <div className="dc-foot">{token.creator?<a href={`/creator/${token.creator}`} title={token.creator}>by {token.creator.slice(0,4)}…{token.creator.slice(-4)}</a>:<span>creator —</span>}<button aria-label={`Copy ${token.symbol} contract address`} title={token.mint} onClick={async()=>{try{await navigator.clipboard.writeText(token.mint);setCopied(true);setCopyError(false);setTimeout(()=>setCopied(false),1800);}catch{setCopyError(true);}}}>{copied?<Check size={10}/>:<Copy size={10}/>}<span aria-live="polite">{copied?'Copied':`${token.mint.slice(0,4)}…${token.mint.slice(-4)}`}</span></button><time dateTime={token.createdAt} title={new Date(token.createdAt).toLocaleString()}>{age(token.createdAt)}</time></div>
 {copyError&&<p className="discovery-copy-error" role="status">Copy unavailable. Open token details.</p>}
 </article>;
}
export function TokenDiscovery({initialQuote='all',roomMode=false,sectionNumber='02 /'}:{sectionNumber?:string|null;initialQuote?:'all'|'SOL'|'wXMR';roomMode?:boolean}={}){
 const [quote,setQuote]=useState(initialQuote);
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[filter,setFilter]=useState<DiscoveryFilter>('all'),[sort,setSort]=useState<DiscoverySort>('newest'),[page,setPage]=useState(1),[retry,setRetry]=useState(0);
 const [result,setResult]=useState<{key:string;data:DiscoveryResult}|null>(null),[error,setError]=useState('');
 const section=useRef<HTMLElement>(null),listTop=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false);
 const key=JSON.stringify([search,filter,sort,page,quote]);
 const data=result?.key===key?result.data:null;
 const shelf=!!data&&data.featured.length>0&&!search&&filter==='all'&&page===1,shelved=new Set(shelf?data!.featured.map(t=>t.mint):[]);
 // A graduated token appears once: on the shelf when it is shown, otherwise in the grid.
 const listed=data?.tokens.filter(t=>!shelved.has(t.mint))||[];
 useEffect(()=>{const timer=setTimeout(()=>{setSearch(query);setPage(1)},250);return()=>clearTimeout(timer);},[query]);
 useEffect(()=>{const element=section.current;if(!element)return;const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{rootMargin:'350px'});observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  if(!visible)return;
  let live=true;
  // A first load that never answers becomes a recoverable error instead of an endless skeleton.
  const timer=setTimeout(()=>{if(live)setError(current=>current||'The token directory is temporarily unavailable. Please try again.');},12_000);
  const stop=startViewerPolling(async(signal:AbortSignal)=>{
   try{
    const response=await fetch(`/api/discovery?q=${encodeURIComponent(search)}&filter=${filter}&sort=${sort}&page=${page}&quote=${quote}`,{signal,cache:'no-store'});
    const body=await response.json() as DiscoveryResult&{error?:string};if(!response.ok)throw Error(body.error||'The token directory is temporarily unavailable. Please try again.');
    if(live){clearTimeout(timer);setResult({key,data:body});setError('');}
   }catch(e){if(live&&!signal.aborted)setError(e instanceof Error?e.message:'The token directory is temporarily unavailable. Please try again.');}
  },{intervalMs:60_000});
  return()=>{live=false;clearTimeout(timer);stop();};
 },[key,search,filter,sort,page,quote,retry,visible]);
 const filters:[DiscoveryFilter,string][]=[['all','All tokens'],['new','New'],['near','About to graduate'],['graduated','Graduated']];
 function changeFilter(next:DiscoveryFilter){setFilter(next);setPage(1);setError('');}
 function navigate(next:number){setPage(next);setError('');listTop.current?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
 return <section className="launch-index token-discovery" id="launches" ref={section} aria-labelledby="launch-index-heading">
 <div className="index-heading discovery-heading"><div><p className="overline">{sectionNumber&&<span className="section-number">{sectionNumber}</span>} ON THE RECORD</p><h2 id="launch-index-heading" className="display-title">{roomMode?'find your room':'every launch'}<span>.</span></h2></div><div className="discovery-network"><i/> SOLANA <span>{data?`${data.total.toLocaleString()} launches`:'LAUNCH DIRECTORY'}</span></div></div>
 <div className="discovery-searchbar"><div className="discovery-search"><Search size={18}/><Input aria-label="Search tokens by name, symbol or contract" placeholder="Search tokens, symbols or addresses" value={query} maxLength={128} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="Clear token search" onClick={()=>setQuery('')}><X size={15}/></button>}</div><a className="discovery-create" href="/launch"><span>Create token</span><ArrowUpRight size={17}/></a></div>
 {shelf&&<div className="graduated-shelf"><div className="graduated-heading"><div><p className="discovery-overline">THE NEXT CHAPTER</p><h3>Graduated <span>{data.counts.graduated}</span></h3><p>Curve filled. Now trading in a Raydium pool.</p></div><button onClick={()=>{changeFilter('graduated');listTop.current?.scrollIntoView({block:'start',behavior:'smooth'})}}>View all <ArrowRight size={16}/></button></div><div className="discovery-grid">{data.featured.map(token=><DiscoveryCard key={token.mint} token={token} roomMode={roomMode}/>)}</div></div>}
 <div className="discovery-explore" ref={listTop}><div className="discovery-explore-heading"><div><h3>Explore <span>{data?.filteredTotal.toLocaleString()??'—'}</span></h3><p>{search?`Results for “${search}”`:'Only launches confirmed on-chain through Grainpad.'}</p></div></div>
 <div className="discovery-controls"><GrainSelect label="Quote market" value={quote} onValueChange={value=>{setQuote(value as typeof quote);setPage(1);}} options={QUOTE_OPTIONS}/><GrainSelect label="Sort by" value={sort} onValueChange={value=>{setSort(value as DiscoverySort);setPage(1);setError('');}} options={SORT_OPTIONS} align="end" className="discovery-sort-select"/></div>
 <div className="discovery-filters" role="group" aria-label="Filter token launches">{filters.map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>changeFilter(value)}>{label}{data&&<span>{data.counts[value]}</span>}</button>)}</div>
 <div className="discovery-results" aria-busy={!data&&!error}>
 {!data&&!error?<div className="discovery-grid discovery-skeleton" aria-label="Loading tokens" role="status">{Array.from({length:5},(_,i)=><div key={i}><div/><span/><span/></div>)}</div>:!data&&error?<div className="discovery-empty" role="alert"><RefreshCw size={26}/><h4>The directory is unavailable.</h4><p>{error}</p><Button variant="outline" onClick={()=>{setError('');setRetry(n=>n+1)}}>Try again</Button></div>:data?.total===0?<div className="discovery-prelaunch"><div className="discovery-first"><span className="discovery-first-mark"><Sprout size={34}/></span><p className="discovery-overline">ROOM FOR YOUR NEXT IDEA</p><h4>The first chapter<br/>starts here.</h4><p>Confirmed Grainpad launches will appear here. Yours could be the first.</p><a href="/launch">Explore the workspace <ArrowUpRight size={16}/></a></div><div className="discovery-grain-pending"><TokenImage src={BRAND_ASSETS.token} symbol="GRAIN" size={68}/><div><span className="discovery-overline">PLATFORM TOKEN</span><strong>GRAIN</strong><p>Awaiting launch</p></div><p>The official contract will be published here after launch. Verify the address, not the name.</p></div></div>:listed.length?<div className="discovery-grid">{listed.map(token=><DiscoveryCard key={token.mint} token={token} roomMode={roomMode}/>)}</div>:<div className="discovery-empty" role="status"><Search size={26}/><h4>{search?'No matching tokens.':filter==='graduated'?'No confirmed graduations yet.':filter==='near'?'No tokens near graduation yet.':'No confirmed curve data yet.'}</h4><p>{search?'Try a name, symbol or complete contract address.':'New shows active curves; About to graduate starts at 80% of the target. Missing snapshots remain unknown.'}</p><Button variant="outline" onClick={()=>{setQuery('');setSearch('');changeFilter('all');}}>View all tokens</Button></div>}
 </div>
 {data?.coverage&&<p className="small muted" role="status">{data.coverage}</p>}
 {data&&data.pages>1&&<nav className="discovery-pagination" aria-label="Token pages"><Button variant="outline" aria-label="Previous token page" disabled={data.page<=1} onClick={()=>navigate(data.page-1)}><ChevronLeft size={16}/></Button>{Array.from(new Set([1,...[data.page-1,data.page,data.page+1].filter(n=>n>1&&n<data.pages),data.pages])).map((n,i,arr)=><span key={n}>{i>0&&n-arr[i-1]>1&&<em>…</em>}<button aria-label={`Token page ${n}`} aria-current={data.page===n?'page':undefined} onClick={()=>navigate(n)}>{n}</button></span>)}<Button variant="outline" aria-label="Next token page" disabled={data.page>=data.pages} onClick={()=>navigate(data.page+1)}><ChevronRight size={16}/></Button></nav>}
 {(error&&data||data?.stale)&&<p className="discovery-status" role="status">Showing the last available directory. Updates are temporarily delayed.</p>}
 <div className="discovery-footnote"><span>Only launches through Grainpad. Listings are not endorsements.</span><span>MC in USD · {data?.counts.unknown?`${data.counts.unknown} awaiting market data`:'Missing data appears as —'}</span></div>
 {data&&data.total>0&&<p className="discovery-coverage">Market figures and graduation filters use available market snapshots. Open a token to refresh its market. GRAIN stays first when its verified contract is published.</p>}
 </div></section>;
}
