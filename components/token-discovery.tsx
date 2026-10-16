'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,ArrowRight,Search,Copy,Check,ChevronLeft,ChevronRight,Plus,X} from 'lucide-react';
import {Input} from './ui/input';
import {GrainSelect} from './grain-select';
import {TokenTile} from './token-tile';
import {GradSquares,StatusChip,tokenStatus} from './grain-ui';
import {BRAND_ASSETS} from '@/lib/brand-assets';
import {grainImpersonation} from '@/lib/launch-identity.mjs';
import {formatPrice} from '@/lib/price-format';
import {formatMarketCap,formatChange} from '@/lib/token-market';
import {startViewerPolling} from '@/lib/viewer-polling.mjs';
import type {DiscoveryResult,DiscoveryToken,DiscoveryFilter,DiscoverySort} from '@/lib/token-discovery';
import {UserIdentity,type IdentityCard} from './user-identity';
import {ChainLogo} from './chain-logo';
import {GraduationInfo} from './graduation-info';
import {useLiveNow} from '@/hooks/use-live-now';
import {CHAIN_FILTERS,CHAIN_FILTER_LABELS,CHAINS,type ChainFilter} from '@/lib/chain-display';
import {isNewLaunch,parseTimestamp} from '@/lib/token-time';
import {tradingVenue} from '@/lib/trading-venue';
const QUOTE_OPTIONS=[{value:'all',label:'All quote markets'},{value:'SOL',label:'SOL'},{value:'wXMR',label:'wXMR'}];
const STATUS_LABELS:Record<DiscoveryFilter,string>={all:'all',new:'new',near:'about to graduate',graduated:'graduated'};
const SORT_OPTIONS=[{value:'newest',label:'Newest'},{value:'oldest',label:'Oldest'},{value:'market-cap',label:'Market cap'},{value:'volume',label:'24h volume'}];
function age(date:string,now:number){const elapsed=Math.max(0,now-Date.parse(date)),minutes=Math.floor(elapsed/60000);return minutes<1?'just now':minutes<60?`${minutes}m ago`:minutes<1440?`${Math.floor(minutes/60)}h ago`:`${Math.floor(minutes/1440)}d ago`;}
/** `sparkline` is an integration point: #39 does not return a per-row price series yet. */
type CardToken=DiscoveryToken&{sparkline?:number[]|null;creatorIdentity?:IdentityCard|null};
function DiscoveryCard({token,roomMode=false,now}:{token:CardToken;roomMode?:boolean;now:number}){
 const [copied,setCopied]=useState(false),[copyError,setCopyError]=useState(false);
 const status=tokenStatus(token);
 const graduated=token.state==='graduated',progress=graduated?100:token.progress,isNew=isNewLaunch(token.launchedAt,now);
 const impersonation=grainImpersonation(token),nativeCap=token.marketCapQuote??null,quoteSymbol=token.chain==='robinhood'?'WETH':token.quoteAsset||'SOL';
 const capLabel=token.marketCapUsd!==null?formatMarketCap(token.marketCapUsd):nativeCap!==null?formatPrice(nativeCap,quoteSymbol,3):'—';
 // Robinhood Chain launches have their own market page; /token/[mint] only accepts Solana mints.
 const href=token.chain==='robinhood'?`/network/robinhood/${token.networkId==='robinhood:mainnet'?'mainnet/':''}token/${token.mint}`:`/token/${token.mint}${roomMode?'/room':''}`;
 return <article className={`gx-token-card is-${token.state}${token.official?' is-grain':''}`}>
 <a className="gx-token-main" href={href} aria-label={`Open ${token.name} ${roomMode&&token.chain!=='robinhood'?'Room':'token market'}`}>
  <TokenTile src={token.official?BRAND_ASSETS.token:token.image} symbol={token.symbol} seed={token.mint}>{token.official&&<StatusChip kind="graduated" label="official"/>}{status&&!token.official&&<StatusChip kind={status.kind} label={status.label}/>}{isNew&&<StatusChip kind="new" label="new"/>}</TokenTile>
  <div className="gx-token-body">
   <h3><span className="gx-token-title"><span className="gx-token-name" title={token.name}>{token.name}</span><ChainLogo chain={token.chain} networkId={token.networkId}/></span><span className="gx-mono gx-mute">${token.symbol}</span></h3>
   {impersonation?<p className="gx-token-caution">not the official GRAIN</p>:<p className="gx-token-pair gx-mono gx-mute">{token.marketVenue==='uniswap-v3'?'WETH':token.quoteAsset||'SOL'} pair{token.figuresSource==='geckoterminal'?' · usd via geckoterminal':''}</p>}
   <div className="gx-token-value"><strong className="gx-num" title={token.marketCapUsd===null?nativeCap!==null?'Market cap in '+quoteSymbol+'; USD conversion unavailable':'Market cap not available yet':undefined}>{capLabel}</strong>{token.change24h!==null&&<small className={`gx-mono ${token.change24h>=0?'is-up':'is-down'}`}>{formatChange(token.change24h)} 24h</small>}</div>
   <p className="gx-token-meta gx-mono gx-mute"><span>{token.state==='curve'||token.state==='graduating'?'curve mc':'mc'}{token.marketCapUsd===null?nativeCap!==null?' · USD unavailable':' · not indexed yet':''}</span><time dateTime={token.launchedAt??token.createdAt} title={new Date(token.launchedAt??token.createdAt).toISOString()}>{age(token.launchedAt??token.createdAt,now)}</time></p>
   {token.marketStale&&<p className="gx-token-delayed gx-mono" role="status">delayed{token.marketUpdatedAt!==null&&<> · last seen <time dateTime={new Date(token.marketUpdatedAt).toISOString()} title={new Date(token.marketUpdatedAt).toISOString()}>{age(new Date(token.marketUpdatedAt).toISOString(),now)}</time></>}</p>}
   {token.marketVenue==='uniswap-v3'?<p className="gx-token-progress gx-mono gx-mute">Uniswap v3 · Robinhood Chain</p>:graduated?<GraduationInfo launchedAt={token.launchedAt} graduatedAt={token.graduatedAt} now={now} venue={tradingVenue({state:token.state,mint:token.mint,quoteMint:token.quoteMint})}/>:<>
   <GradSquares progress={progress} label={`Graduation progress for ${token.symbol}`}/>
   <p className="gx-token-progress gx-mono gx-mute">{progress===null?'curve not read yet':`${Math.round(progress)}% to graduate`}</p></>}
  </div>
 </a>
 <div className="gx-token-foot">{token.creator&&token.chain==='robinhood'?<span className="gx-mono gx-mute" title={token.creator}>creator {token.creator.slice(0,6)}…{token.creator.slice(-4)}</span>:token.creator?<UserIdentity compact wallet={token.creator} identity={token.creatorIdentity}/>:<span className="gx-mono gx-mute">creator —</span>}<button className="gx-mono" aria-label={`Copy ${token.symbol} contract address`} title={token.mint} onClick={async()=>{try{await navigator.clipboard.writeText(token.mint);setCopied(true);setCopyError(false);setTimeout(()=>setCopied(false),1800);}catch{setCopyError(true);}}}>{copied?<Check size={11}/>:<Copy size={11}/>}<span aria-live="polite">{copied?'copied':`${token.mint.slice(0,4)}…${token.mint.slice(-4)}`}</span></button></div>
 {copyError&&<p className="gx-token-caution" role="status">copy unavailable. open the token page.</p>}
 </article>;
}
function InviteCard(){
 return <a className="gx-invite gx-onor" href="/launch"><span className="gx-label is-ink">your token here</span><span className="gx-invite-title">launch<br/>yours<span>.</span></span><span className="gx-invite-foot"><span className="gx-mono">name it, add an image, launch from your own wallet.</span><span className="gx-invite-plus" aria-hidden="true"><Plus size={26}/></span></span></a>;
}
/** `board`: the home "launched tokens." grid. `directory`: search, sort, quote market and pages. Both read /api/discovery only. */
export function TokenDiscovery({initialQuote='all',roomMode=false,sectionNumber:_sectionNumber=null,initialData=null,variant='directory',title}:{initialData?:DiscoveryResult|null;sectionNumber?:string|null;initialQuote?:'all'|'SOL'|'wXMR';roomMode?:boolean;variant?:'board'|'directory';title?:string}={}){
 void _sectionNumber;
 const board=variant==='board';
 const [quote,setQuote]=useState(initialQuote);
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[filter,setFilter]=useState<DiscoveryFilter>('all'),[chain,setChain]=useState<ChainFilter>('all'),[sort,setSort]=useState<DiscoverySort>('newest'),[page,setPage]=useState(1),[retry,setRetry]=useState(0);
 const [result,setResult]=useState<{key:string;data:DiscoveryResult}|null>(()=>initialData?{key:JSON.stringify(['','all','newest',1,initialQuote,'all']),data:initialData}:null),[error,setError]=useState('');
 const section=useRef<HTMLElement>(null),listTop=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false);
 const key=JSON.stringify([search,filter,sort,page,quote,chain]);
 const data=result?.key===key?result.data:null;
 // One clock for every NEW badge, NEW filter result and relative time on the page.
 const now=useLiveNow(data?.updatedAt??initialData?.updatedAt,(data?.tokens??[]).map(t=>parseTimestamp(t.launchedAt)));
 const shelf=!board&&!!data&&data.featured.length>0&&!search&&filter==='all'&&page===1,shelved=new Set(shelf?data!.featured.map(t=>t.mint):[]);
 // A graduated token appears once: on the shelf when it is shown, otherwise in the grid.
 const listed=(data?.tokens.filter(t=>!shelved.has(t.mint)&&(filter!=='new'||isNewLaunch(t.launchedAt,now)))||[]).slice(0,board?7:undefined);
 const expiredHere=filter==='new'&&data?data.tokens.length-data.tokens.filter(t=>isNewLaunch(t.launchedAt,now)).length:0;
 const lastExpiryRefetch=useRef(0);
 useEffect(()=>{const timer=setTimeout(()=>{setSearch(query);setPage(1)},250);return()=>clearTimeout(timer);},[query]);
 useEffect(()=>{const element=section.current;if(!element)return;const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{rootMargin:'350px'});observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  if(!visible)return;
  let live=true;
  // A first load that never answers becomes a recoverable error instead of an endless skeleton.
  const timer=setTimeout(()=>{if(live)setError(current=>current||'The token directory is temporarily unavailable. Please try again.');},12_000);
  const stop=startViewerPolling(async(signal:AbortSignal)=>{
   try{
    const response=await fetch(`/api/discovery?q=${encodeURIComponent(search)}&filter=${filter}&sort=${sort}&page=${page}&quote=${quote}&chain=${chain}`,{signal,cache:'no-store'});
    const body=await response.json() as DiscoveryResult&{error?:string};if(!response.ok)throw Error(body.error||'The token directory is temporarily unavailable. Please try again.');
    if(live){clearTimeout(timer);setResult({key,data:body});setError('');}
   }catch(e){if(live&&!signal.aborted)setError(e instanceof Error?e.message:'The token directory is temporarily unavailable. Please try again.');}
  },{intervalMs:60_000});
  return()=>{live=false;clearTimeout(timer);stop();};
 },[key,search,filter,sort,page,quote,chain,retry,visible]);
 // A token that just left its 12-hour window is hidden at once; refetch (at most every 15s) so server counts and pages catch up.
 useEffect(()=>{if(!data||!data.tokens.some(t=>isNewLaunch(t.launchedAt,data.updatedAt)&&!isNewLaunch(t.launchedAt,now))||now-lastExpiryRefetch.current<15_000)return;lastExpiryRefetch.current=now;setRetry(n=>n+1);},[data,now]);
 const filters:[DiscoveryFilter,string][]=board?[['all','all'],['new','new'],['near','about to graduate'],['graduated','graduated']]:[['all','all'],['new','new'],['near','about to graduate'],['graduated','graduated']];
 function changeFilter(next:DiscoveryFilter){setFilter(next);setPage(1);setError('');}
 function changeChain(next:ChainFilter){setChain(next);setPage(1);setError('');}
 function navigate(next:number){setPage(next);setError('');listTop.current?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
 const invite=!roomMode;
 const heading=title??(roomMode?'find your room':board?'launched tokens':'launches');
 const zero=data?.total===0&&!data.officialMint&&quote==='all'&&chain==='all';
 const filtered=chain!=='all'||filter!=='all'||!!search,shownCount=data?Math.max(0,data.filteredTotal-expiredHere):0;
 return <section className={`gx-launches launch-index token-discovery${board?' is-board':' is-directory'}`} id="launches" ref={section} aria-labelledby="launch-index-heading">
 <div className="gx-launches-head">
  <div><p className="gx-label">{board?'the launch board':roomMode?'rooms · crew boards':'solana · confirmed launches'}</p><h2 id="launch-index-heading" className={board?'gx-h2':'gx-display'}>{heading}<span className="gx-dot">.</span></h2></div>
  <div className="gx-launches-tools">
   <p className="gx-mono gx-mute gx-launches-count"><span className="gx-live-dot" aria-hidden="true"/>{data?`${filtered?`${shownCount.toLocaleString()} of ${data.chainCounts.all.toLocaleString()}`:shownCount.toLocaleString()} ${shownCount===1&&!filtered?'launch':'launches'}`:'launch directory'}{data?.counts.unknown?` · ${data.counts.unknown} awaiting market data`:''}</p>
   <div className="gx-seg gx-seg-chain" role="group" aria-label="Filter launches by chain">{CHAIN_FILTERS.map(value=><button key={value} aria-pressed={chain===value} onClick={()=>changeChain(value)}>{CHAIN_FILTER_LABELS[value]}{data&&!board&&<span>{data.chainCounts[value]}</span>}</button>)}</div>
   <div className="gx-seg" role="group" aria-label="Filter token launches">{filters.map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>changeFilter(value)}>{label}{data&&!board&&<span>{data.counts[value]}</span>}</button>)}</div>
  </div>
 </div>
 {!board&&<div className="gx-launches-bar">
  <div className="gx-search"><Search size={17} aria-hidden="true"/><Input aria-label="Search tokens by name, symbol or contract" placeholder="name, ticker or address" value={query} maxLength={128} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="Clear token search" onClick={()=>setQuery('')}><X size={15}/></button>}</div>
  <div className="gx-launches-selects"><GrainSelect label="Quote" value={quote} onValueChange={value=>{setQuote(value as typeof quote);setPage(1);}} options={QUOTE_OPTIONS}/><GrainSelect label="Sort" value={sort} onValueChange={value=>{setSort(value as DiscoverySort);setPage(1);setError('');}} options={SORT_OPTIONS} align="end" className="discovery-sort-select"/></div>
 </div>}
 {shelf&&<div className="gx-shelf"><div className="gx-shelf-head"><div><p className="gx-label">the next chapter</p><h3 className="gx-h3">graduated <span className="gx-mono gx-mute">{data.counts.graduated}</span></h3><p className="gx-mute">curve filled. now trading in a raydium pool.</p></div><button className="gx-ghost is-sm" onClick={()=>{changeFilter('graduated');listTop.current?.scrollIntoView({block:'start',behavior:'smooth'})}}>view all <ArrowRight size={15}/></button></div><div className="gx-grid">{data.featured.map(token=><DiscoveryCard key={token.mint} token={token} roomMode={roomMode} now={now}/>)}</div></div>}
 <div className="gx-launches-results" ref={listTop} aria-busy={!data&&!error}>
 {search&&<p className="gx-mono gx-mute gx-results-for">results for “{search}” · {data?.filteredTotal.toLocaleString()??'—'}</p>}
 {!data&&!error?<div className="gx-grid gx-skeleton" aria-label="Loading tokens" role="status">{invite&&<InviteCard/>}{Array.from({length:board?3:7},(_,i)=><div key={i} className="gx-token-card is-loading"><div/><span/><span/><span/></div>)}</div>
 :!data&&error?<div className="gx-state" role="alert"><p className="gx-label">directory · unavailable</p><h3 className="gx-h3">the board didn’t load<span className="gx-dot">.</span></h3><p className="gx-mute">{error} nothing on this page changed on-chain.</p><button className="gx-ghost" onClick={()=>{setError('');setRetry(n=>n+1)}}>try again</button></div>
 :zero?<div className="gx-grid">{invite&&<InviteCard/>}<div className="gx-state gx-state-first"><p className="gx-label">no launches yet</p><h3 className="gx-h3">the first launch goes here<span className="gx-dot">.</span></h3><p className="gx-mute">confirmed grainpad launches appear on this board once they are seen on-chain. yours could be the first.</p><div className="gx-state-grain"><TokenTile src={BRAND_ASSETS.token} symbol="GRAIN" seed="grain" small/><p><strong>GRAIN</strong><span className="gx-mono gx-mute">platform token · awaiting launch. the official contract is published here after launch. verify the address, not the name.</span></p></div></div></div>
 :listed.length?<div className="gx-grid">{invite&&!search&&filter==='all'&&chain==='all'&&page===1&&<InviteCard/>}{listed.map(token=><DiscoveryCard key={token.mint} token={token} roomMode={roomMode} now={now}/>)}</div>
 :<div className="gx-state" role="status"><p className="gx-label">{search?'search':'filter'} · empty</p><h3 className="gx-h3">{data?.total===0&&quote!=='all'?`nothing in the ${quote} market yet`:search?'nothing here yet':chain!=='all'?`no ${CHAINS[chain].shortLabel}${filter==='all'?'':` ${STATUS_LABELS[filter]}`} tokens`:filter==='graduated'?'no graduations yet':filter==='near'?'nobody near graduation yet':filter==='new'?'nothing launched in the last 12 hours':'no curve data yet'}<span className="gx-dot">.</span></h3><p className="gx-mute">{search?'try a name, ticker or the full contract address.':chain!=='all'?`no ${CHAINS[chain].name} token matches ${STATUS_LABELS[filter]}. try another status or all chains.`:'new shows launches from the last 12 hours; about to graduate starts at 80% of the target. missing snapshots stay unknown.'}</p><div className="gx-state-actions"><a className="gx-pill is-orange" href="/launch">be the first one <ArrowUpRight size={16}/></a><button className="gx-ghost" onClick={()=>{setQuery('');setSearch('');setQuote('all');setChain('all');changeFilter('all');}}>view all tokens</button></div></div>}
 </div>
 {board?<div className="gx-launches-foot"><p className="gx-mono gx-mute">{data?.total?`only launches confirmed on-chain through grainpad · listings are not endorsements · mc in usd, — when not indexed`:'only launches confirmed on-chain through grainpad'}</p><a className="gx-ghost is-sm" href="/launches">see all launches <ArrowRight size={15}/></a></div>
 :<>
 {data&&data.pages>1&&<nav className="gx-pager" aria-label="Token pages"><span className="gx-mono gx-mute">page {data.page} of {data.pages}</span><div><button className="gx-icon" aria-label="Previous token page" disabled={data.page<=1} onClick={()=>navigate(data.page-1)}><ChevronLeft size={16}/></button>{Array.from(new Set([1,...[data.page-1,data.page,data.page+1].filter(n=>n>1&&n<data.pages),data.pages])).map((n,i,arr)=><span key={n}>{i>0&&n-arr[i-1]>1&&<em>…</em>}<button className="gx-icon" aria-label={`Token page ${n}`} aria-current={data.page===n?'page':undefined} onClick={()=>navigate(n)}>{n}</button></span>)}<button className="gx-icon" aria-label="Next token page" disabled={data.page>=data.pages} onClick={()=>navigate(data.page+1)}><ChevronRight size={16}/></button></div></nav>}
 <div className="gx-launches-foot is-notes"><p className="gx-mono gx-mute">only launches through grainpad. listings are not endorsements.</p><p className="gx-mono gx-mute">mc in usd · {data?.counts.unknown?`${data.counts.unknown} awaiting market data`:'missing data appears as —'}</p></div>
 {data&&data.total>0&&<p className="gx-mono gx-mute gx-coverage">market figures and graduation filters use the last observed market snapshots. delayed observations are marked with their age. open a token to refresh its market. GRAIN stays first when its verified contract is published.</p>}
 </>}
 {data?.coverage&&<p className="gx-mono gx-mute gx-coverage" role="status">{data.coverage}</p>}
 {(error&&data||data?.stale)&&<p className="gx-delayed-note gx-mono" role="status">showing the last available directory · updates are delayed</p>}
 </section>;
}
