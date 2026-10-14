"use client";
import {useEffect,useRef,useState,type KeyboardEvent} from "react";
import {ArrowDown,ArrowRight,ArrowUpRight,Pause,Play} from "lucide-react";
import {HeroFeatures,SiteStats,useSiteOverview} from "@/components/site-overview";
import {TokenDiscovery} from "@/components/token-discovery";
import {SiteHeader} from "@/components/site-header";
import {LaunchDisclosure} from "@/components/launch-disclosure";
import {SiteFooter} from "@/components/site-footer";
import {useLaunchStatus} from "@/components/use-launch-status";
import {LaunchDesk} from "@/components/launch-desk";
import {GrainStage,grainWord,type GrainMode} from "./grain-stage";
import {ReceiptRows,tokenStatus} from "./grain-ui";
import {formatMarketCap} from "@/lib/token-market";
import {startViewerPolling} from "@/lib/viewer-polling.mjs";
import {LaunchNetworkHomeSelect} from "./launch-network-home-select";
import {MONERO_NARRATIVE,moneroRecordSummary} from "@/lib/monero-record-status.mjs";
import type {DiscoveryResult,DiscoveryToken} from "@/lib/token-discovery";

const STAGES:[string,string][]=[["idea","everything starts with an idea. loose, restless, not yet anything."],["identity","give it a name. a ticker, an image, a story worth putting out there."],["on-chain","then it's out. a public receipt, a live tape and a market of its own."]];

function ago(date:string,now:number){const minutes=Math.floor(Math.max(0,now-Date.parse(date))/60000);return minutes<1?"just now":minutes<60?`${minutes}m ago`:minutes<1440?`${Math.floor(minutes/60)}h ago`:`${Math.floor(minutes/1440)}d ago`;}

/** Hero: the composer on the left, the grain stage on the right. Nothing on this page asks a wallet for anything. */
function Hero({overview,status}:{overview:ReturnType<typeof useSiteOverview>;status:ReturnType<typeof useLaunchStatus>["status"]}){
 const [name,setName]=useState(""),[word,setWord]=useState("grainpad"),[mode,setMode]=useState<GrainMode>(0),[auto,setAuto]=useState(true),[kick,setKick]=useState(0),[reduce,setReduce]=useState(false);
 const hero=useRef<HTMLElement>(null),visible=useRef(true),tabs=useRef<(HTMLButtonElement|null)[]>([]);
 useEffect(()=>{const media=matchMedia("(prefers-reduced-motion: reduce)");const sync=()=>{setReduce(media.matches);if(media.matches)setAuto(false);};sync();media.addEventListener("change",sync);return()=>media.removeEventListener("change",sync);},[]);
 useEffect(()=>{const node=hero.current;if(!node)return;const io=new IntersectionObserver(([entry])=>{visible.current=entry.isIntersecting;});io.observe(node);return()=>io.disconnect();},[]);
 // Autoplay only while the hero is on screen and the tab is visible; any tab click or keystroke stops it.
 useEffect(()=>{if(!auto)return;const timer=setInterval(()=>{if(visible.current&&!document.hidden)setMode(m=>((m+1)%3) as GrainMode);},5200);return()=>clearInterval(timer);},[auto]);
 useEffect(()=>{const timer=setTimeout(()=>setWord(grainWord(name)),160);return()=>clearTimeout(timer);},[name]);
 function choose(next:GrainMode){setMode(next);setAuto(false);}
 function onTabKey(e:KeyboardEvent<HTMLDivElement>){
  const keys:Record<string,number>={ArrowRight:1,ArrowLeft:-1,Home:-9,End:9};if(!(e.key in keys))return;e.preventDefault();
  const step=keys[e.key],next=(step===-9?0:step===9?2:(mode+step+3)%3) as GrainMode;choose(next);tabs.current[next]?.focus();
 }
 const typed=name.trim();
 return <section className="gx-hero gx-wrap" id="main-content" ref={hero} aria-labelledby="hero-heading">
  <div className="gx-hero-copy">
   <p className="gx-label">token launches · ideas into existence</p>
   <h1 id="hero-heading" className="gx-h1">ideas into existence<span className="gx-dot">.</span></h1>
   <p className="gx-hero-sub">choose your network. launch a token from your own wallet. follow its public receipt and market.</p>
   <form className="gx-composer" action="/launch" method="get">
    <label className="gx-composer-field"><span className="gx-mono gx-mute">name your idea</span><input name="name" value={name} maxLength={32} autoComplete="off" spellCheck={false} placeholder="grainpad" onChange={e=>{setName(e.target.value);setAuto(false);setMode(1);setKick(k=>k+1);}}/></label>
    <LaunchNetworkHomeSelect/><button type="submit" className="gx-pill is-orange gx-composer-go">launch it <ArrowRight size={18}/></button>
   </form>
   <ol className="gx-hero-steps gx-mono gx-mute"><li><span>01</span> name it</li><li><span>02</span> add an image</li><li><span>03</span> launch from your own wallet</li></ol>
   <div className="gx-hero-links"><a className="gx-ghost" href="#launches">browse launches <ArrowDown size={16}/></a><span className="gx-mono gx-mute">nothing is signed on this page</span></div>
   <div className="gx-hero-status"><a className="gx-mono" href="/platform"><span className={`gx-status-dot${status.state==="open"?" is-on":""}`} aria-hidden="true"/>{status.label} <ArrowUpRight size={12}/></a><HeroFeatures data={overview}/></div>
  </div>
  <div className="gx-hero-stage">
   <div className="gx-stage-top gx-mono gx-mute"><span className="gx-label"><span className="gx-word">grainpad</span> / in the making</span><span>interactive illustration · no transaction</span></div>
   <div className="gx-stage-canvas"><GrainStage mode={mode} word={word} kick={kick}/><span className="gx-stage-corner is-tl" aria-hidden="true"/>
    {!reduce&&<button type="button" className="gx-icon gx-stage-play" aria-label={auto?"Pause animation":"Play animation"} aria-pressed={!auto} onClick={()=>setAuto(a=>!a)}>{auto?<Pause size={14}/>:<Play size={14}/>}</button>}
   </div>
   <div className="gx-stage-tabs" role="tablist" aria-label="From idea to on-chain" onKeyDown={onTabKey}>{STAGES.map(([label],i)=><button key={label} ref={el=>{tabs.current[i]=el;}} type="button" role="tab" id={`hero-tab-${i}`} aria-selected={mode===i} aria-controls="hero-stage-panel" tabIndex={mode===i?0:-1} onClick={()=>choose(i as GrainMode)}><b>0{i+1}</b> {label}</button>)}</div>
   <p className="gx-stage-says" id="hero-stage-panel" role="tabpanel" aria-labelledby={`hero-tab-${mode}`}>{STAGES[mode][1]}</p>
   <p className="sr-only" aria-live="polite">{typed?`The illustration spells ${word}.`:""}</p>
  </div>
 </section>;
}

/** Orange marquee of the latest confirmed launches. Starts from the server snapshot, then polls /api/discovery while
 * the page is visible; data older than two refresh intervals is marked delayed with its age. */
const BAND_REFRESH_MS=60_000;
function LaunchBand({data:initial}:{data:DiscoveryResult|null}){
 const [data,setData]=useState(initial),[failed,setFailed]=useState(false),[now,setNow]=useState(initial?.updatedAt??0);
 // eslint-disable-next-line react-hooks/set-state-in-effect -- Ages render from the snapshot on the server, then from the viewer clock.
 useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),15_000);return()=>clearInterval(timer);},[]);
 useEffect(()=>startViewerPolling(async(signal:AbortSignal)=>{
  try{const response=await fetch('/api/discovery?q=&filter=all&sort=newest&page=1&quote=all',{signal,cache:'no-store'});if(!response.ok)throw Error();const body=await response.json() as DiscoveryResult;if(!Array.isArray(body.tokens))throw Error();setData(body);setFailed(false);}
  catch{if(!signal.aborted)setFailed(true);}
 },{intervalMs:BAND_REFRESH_MS}),[]);
 const age=data&&now?now-data.updatedAt:0,delayed=!!data&&(data.stale||failed||age>2*BAND_REFRESH_MS);
 const seen=new Set<string>(),tokens:DiscoveryToken[]=[];
 for(const token of [...(data?.tokens??[]),...(data?.featured??[])])if(!seen.has(token.mint)&&tokens.length<14){seen.add(token.mint);tokens.push(token);}
 if(!tokens.length)return <div className="gx-band gx-onor is-empty" role="status"><div className="gx-wrap gx-mono"><span><i/>{data?"no launches on the board yet · the first one could be yours":failed?"the launch board is unavailable right now":"the launch board is loading"}</span><a href="/launch">launch yours <ArrowRight size={13}/></a></div></div>;
 const items=tokens.map(token=>{const status=tokenStatus(token);return <a key={token.mint} href={`/token/${token.mint}`}><i/>{token.official?"official":status?.label??"launch"} <b>${token.symbol}</b> {ago(token.createdAt,now||data!.updatedAt)} · mc {formatMarketCap(token.marketCapUsd)}{token.marketStale?" · delayed":""}</a>;});
 return <section className="gx-band gx-onor" aria-label="Latest grainpad launches">{delayed&&<span className="gx-band-delayed gx-mono" role="status">delayed · {ago(new Date(data!.updatedAt).toISOString(),now)}</span>}<div className="gx-band-track"><div className="gx-band-set">{items}</div><div className="gx-band-set" aria-hidden="true" inert>{items}</div></div></section>;
}

export function Home({initialOverview,initialDiscovery}:{initialOverview:import("@/components/site-overview").SiteOverviewData|null;initialDiscovery:DiscoveryResult|null}){
 const overview=useSiteOverview(initialOverview);
 const {status}=useLaunchStatus();
 return <main className="gx gx-home">
  <a className="skip-content" href="#main-content">Skip to content</a><SiteHeader/>
  <Hero overview={overview} status={status}/>
  <LaunchBand data={initialDiscovery}/>
  <div className="gx-wrap gx-section"><TokenDiscovery variant="board" initialData={initialDiscovery}/></div>
  <section className="gx-why gx-onor" aria-labelledby="why-heading"><div className="gx-wrap">
   <div className="gx-why-row">
    <div><p className="gx-label is-ink">why launch here</p><h2 id="why-heading" className="gx-why-title">every launch gets a receipt<span>.</span></h2></div>
    <div className="gx-receipt gx-why-receipt"><div className="gx-receipt-head"><span>launch receipt</span><span>what it records</span></div>
     {/* Rows follow docs/TRUST_MODEL.md (wallet and server boundary) and lib/public-receipt.mjs; nothing stronger. */}
     <ReceiptRows rows={[["creator buy","as declared · not verified"],["creator buys seen","indexed from chain"],["launch transaction","linked"],["metadata hash","as registered"],["approved in","the creator’s own wallet"],["mint key","grn · grainpad inventory or imported"]]}/>
     <p className="gx-receipt-note gx-mono">published for launches confirmed on-chain and indexed by grainpad.</p>
    </div>
   </div>
   <div className="gx-why-three">
    <div><span className="gx-mono">01</span><h3>a receipt for every launch.</h3><p>the creator’s declared buy, the buys the index saw, the launch transaction and metadata hash. one public page per indexed launch.</p></div>
    <div><span className="gx-mono">02</span><h3>the tape is ours.</h3><p>trades come from grainpad’s own index. outside sources are a second look, not the page.</p></div>
    <div><span className="gx-mono">03</span><h3>a room for the crew.</h3><p>tasks, credits and payments, tied to the wallets that did the work.</p></div>
   </div>
  </div></section>
  <section className="gx-wrap gx-section gx-record" aria-labelledby="launch-desk-title">
   <LaunchDesk status={status}/>
   <SiteStats data={overview}/>
  </section>
  <section className="gx-wrap gx-section gx-lab" aria-labelledby="research-heading">
   <div><p className="gx-label">monero lab</p><h2 id="research-heading" className="gx-h3">inside the lab<span className="gx-dot">.</span></h2></div>
   <p className="gx-mute">{MONERO_NARRATIVE} {moneroRecordSummary()} The lab shows the record format beside the earlier regtest-only p/xmr research. No XMR backing, no bridge, and no affiliation with Monero or p/xmr.</p>
   <a className="gx-ghost is-sm" href="/lab">open the monero lab <ArrowUpRight size={15}/></a>
  </section>
  <section className="gx-wrap gx-disclosures home-disclosures" aria-label="Launch disclosures"><LaunchDisclosure/></section>
  <SiteFooter/>
 </main>;
}
