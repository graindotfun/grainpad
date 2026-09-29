"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Native navigation avoids the deployed vinext RSC client-router failure. */
import {BRAND_CHAIN} from "@/lib/brand-presentation";
import {HeroFeatures,SiteStats,useSiteOverview} from "@/components/site-overview";
import {TokenImage} from "@/components/token-image";
import {grainImpersonation} from "@/lib/launch-identity.mjs";
import {BRAND_ASSETS} from "@/lib/brand-assets";
import Image from "next/image";
import {useEffect,useState} from "react";
import {ArrowUpRight,ArrowDown,Plus,FlaskConical,Layers3,RefreshCw} from "lucide-react";
import {SiteHeader} from "@/components/site-header";
import {GenesisField} from "@/components/genesis-field";
import {KineticText} from "@/components/kinetic-text";
import {TokenTape} from "@/components/token-tape";
import {LaunchDisclosure} from "@/components/launch-disclosure";
import {SiteFooter} from "@/components/site-footer";
import type {PlatformStatus} from "@/lib/platform-policy";

type Launch={quoteAsset?:string;mint:string;name:string;symbol:string;image:string;platformName?:string;official?:boolean};
export default function Home(){
 const overview=useSiteOverview();
 const [nextCursor,setNextCursor]=useState<string|null>(null),[moreBusy,setMoreBusy]=useState(false),[moreError,setMoreError]=useState(false);
 async function loadMore(){if(!nextCursor||moreBusy)return;setMoreBusy(true);setMoreError(false);try{const r=await fetch(`/api/launches?network=mainnet-beta&cursor=${encodeURIComponent(nextCursor)}`);if(!r.ok)throw Error();const d=await r.json() as {launches:Launch[];nextCursor:string|null};setLaunches(rows=>[...rows,...d.launches.filter(row=>!rows.some(existing=>existing.mint===row.mint))]);setNextCursor(d.nextCursor)}catch{setMoreError(true)}finally{setMoreBusy(false)}}
 const [platform,setPlatform]=useState<PlatformStatus|null>(null),[platformError,setPlatformError]=useState(false);
 const [officialMint,setOfficialMint]=useState<string|null|undefined>(undefined);
 const [launches,setLaunches]=useState<Launch[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let current=true;fetch("/api/platform").then(r=>{if(!r.ok)throw Error();return r.json() as Promise<PlatformStatus>}).then(d=>{if(current)setPlatform(d)}).catch(()=>{if(current)setPlatformError(true)});return()=>{current=false}},[]);
 useEffect(()=>{let current=true;fetch("/api/launches?network=mainnet-beta").then(r=>{if(!r.ok)throw Error();return r.json() as Promise<{launches:Launch[];nextCursor:string|null;officialMint:string|null}>}).then(d=>{if(current){setLaunches(d.launches);setNextCursor(d.nextCursor);setOfficialMint(d.officialMint)}}).catch(()=>{if(current)setError(true)}).finally(()=>{if(current)setLoading(false)});return()=>{current=false}},[attempt]);
 const status=platform?.stale?"Platform data is stale · retry shortly":platform?.active?"Launches are open":platform?"Platform activation pending":platformError?"Platform status unavailable":"Checking platform status";
 return <main className="landing-shell">
  <a className="skip-content" href="#main-content">Skip to content</a><SiteHeader/>
  <section className="brand-hero" id="main-content" aria-labelledby="hero-heading">
   <div className="hero-copy"><p className="overline"><span className="hero-network"><span className="orange-square"/> {BRAND_CHAIN.label.toUpperCase()}</span> IDEAS INTO EXISTENCE</p>
    <h1 id="hero-heading"><span className="hero-opening"><KineticText>Your idea.</KineticText></span><br/><span className="hero-soft">On-chain<span className="hero-dot">.</span></span></h1>
    <p className="hero-description">Create your token. Shape what comes next.<br/>Clear launch conditions. Your wallet. Your call.</p>
    <HeroFeatures data={overview}/>
    <div className="hero-actions"><a href="/launch" className="action-button action-light">Create a token <ArrowUpRight size={20}/></a><a href="#launches" className="action-text">Explore launches <ArrowDown size={17}/></a></div>
    <a className="hero-status" href="/platform"><span className={`status-indicator ${platform?.active?"is-active":""}`}/><span>{status}</span><ArrowUpRight size={12}/></a>
   </div><div className="hero-art"><GenesisField/></div>
   <div className="hero-baseline"><span><i/> FROM FIRST IDEA TO FIRST BLOCK.</span><a href="#approach">Discover the approach <ArrowDown size={13}/></a></div>
  </section>
  <TokenTape hideEmpty={!launches.length}/>
  <SiteStats data={overview}/>
  <div className="technology-line"><span className="overline">THE FOUNDATION</span><span className="technology-name"><Image unoptimized className="solana-logo" src="/brand/solana-sol-icon.svg" alt="" width={24} height={19}/>{BRAND_CHAIN.label}</span><span className="technology-separator"/><span className="technology-name raydium-name"><Image unoptimized className="raydium-logo" src="/brand/raydium-logo.svg" alt="" width={22} height={26}/>Raydium <span>LaunchLab</span></span><span className="technology-note">Established infrastructure.<br/>An independent point of view.</span></div>
  <section className="approach-section" id="approach" aria-labelledby="approach-heading">
   <div className="section-intro"><p className="overline"><span className="section-number">01 /</span> A BETTER START</p><h2 id="approach-heading">The next move<br/><span>is yours.</span></h2><p>From the details that make a token yours to the transaction that brings it on-chain. Every step has its place.</p><a href="/launch" className="underlined-link">Inside the workspace <ArrowUpRight size={17}/></a></div>
   <div className="approach-steps"><article><span className="approach-number">01</span><div><h3>Give it an identity.</h3><p>A name, a symbol, a story. Compose your token and see its identity take shape before you connect.</p></div><span className="step-glyph"><Plus size={24}/></span></article><article><span className="approach-number">02</span><div><h3>See the whole picture.</h3><p>Review supply, launch conditions and estimated costs. Set a spending limit before signing.</p></div><span className="step-glyph"><span className="review-glyph"/></span></article><article><span className="approach-number">03</span><div><h3>Make the final call.</h3><p>Approve the transaction in your own wallet. A submitted launch becomes a listing only after verification.</p></div><span className="step-glyph"><ArrowUpRight size={24}/></span></article></div>
  </section>
  <section className="launch-index" id="launches" aria-labelledby="launch-index-heading">
   <div className="index-heading"><div><p className="overline"><span className="section-number">02 /</span> ON THE RECORD</p><h2 id="launch-index-heading">New beginnings.</h2></div><span className="index-network"><span/> {BRAND_CHAIN.networkLabel.toUpperCase()}</span></div>
   {launches.length>0&&<div className="index-columns"><span>TOKEN / IDENTITY</span><span>ORIGIN</span><span>EXPLORE</span></div>}
   {officialMint===null&&launches.length>0&&<article className="official-pending"><TokenImage src={BRAND_ASSETS.token} symbol="GRAIN"/><div><strong>GRAIN <span className="official-badge">Official</span></strong><p>Grainpad’s platform token · Awaiting launch</p><small>The official contract will appear here after publication. Names and logos do not establish identity.</small></div></article>}
   <div className="index-content" aria-live="polite" aria-busy={loading}>
   {loading?<div className="index-empty"><span className="empty-mark"><RefreshCw className="spin" size={22}/></span><div><h3>Reading the launch directory.</h3><p>Checking confirmed launch records.</p></div></div>:error?<div className="index-empty"><span className="empty-mark"><Layers3 size={23}/></span><div><h3>The directory is unavailable.</h3><p>Launch records could not be loaded. Try again in a moment.</p></div><button className="action-text" onClick={()=>{setLoading(true);setError(false);setAttempt(a=>a+1)}}>Try again <RefreshCw size={15}/></button></div>:launches.length?launches.map(row=><article className={`index-row ${row.official?"is-official":""}`} key={row.mint}><div><TokenImage src={row.official?BRAND_ASSETS.token:row.image} symbol={row.symbol}/><span><strong>{row.name} {row.official&&<span className="official-badge">Official</span>}</strong><small>${row.symbol} · Paired with {row.quoteAsset||'SOL'}</small></span></div><span className="verified-label">{grainImpersonation(row)?"Not the official GRAIN":"Launched via Grainpad"}</span><a className="index-view" aria-label={`Trade ${row.name} on Grainpad`} href={`/token/${row.mint}`}>Trade <ArrowUpRight size={17}/></a></article>):<div className="prelaunch-block"><div><p className="overline">GRAINPAD / THE FIRST CHAPTER</p><h3>A place for your<br/>next beginning.</h3><p>No Grainpad launches yet. The directory and live tape begin with the first confirmed launch.</p><a className="action-button action-light" href="/launch">Explore the workspace</a></div><div className="prelaunch-contract"><div className="prelaunch-token"><TokenImage src={BRAND_ASSETS.token} symbol="GRAIN" size={56}/><div><b>GRAIN</b><span>Official platform token</span></div></div><span className="overline">OFFICIAL GRAIN CONTRACT</span><strong>{officialMint?'Published':'After launch'}</strong>{officialMint?<a className="address-line" href={`/token/${officialMint}`}>{officialMint}</a>:<p>The verified address will appear here after publication. No official CA is published yet.</p>}<span>Check the address. Names and logos can be copied.</span></div></div>}
   </div>{nextCursor&&<button className="action-text" onClick={()=>void loadMore()} disabled={moreBusy}>{moreBusy?"Loading launches…":"Load more launches"}</button>}{moreError&&<p role="status" className="index-footnote">More launches could not be loaded. Try again.</p>}<p className="index-footnote">Listings are checked against their on-chain pool and metadata. “Launched via Grainpad” describes origin, not an endorsement. Only the published GRAIN mint receives the Official badge.</p>
  </section>
  <section className="principles-section" aria-labelledby="principles-heading"><div className="principles-title"><p className="overline"><span className="section-number">03 /</span> CLEAR BY DESIGN</p><h2 id="principles-heading">The details<br/>are the difference<span>.</span></h2><a href="/docs" className="underlined-link">Read the Docs <ArrowUpRight size={17}/></a></div><div className="principles-list"><div><span>01</span><h3>No initial team allocation.</h3><p>This creation flow assigns no token supply to the team and makes no initial purchase.</p></div><div><span>02</span><h3>Conditions you can inspect.</h3><p>Platform configuration, fee destinations and activation status are available to check.</p></div><div><span>03</span><h3>Your signature. Your decision.</h3><p>Preparing a launch is separate from signing it. Nothing launches without your approval.</p></div></div></section>
  <section className="research-card" aria-labelledby="research-heading"><div><p className="overline"><FlaskConical size={15}/> SEPARATE RESEARCH</p><h2 id="research-heading">Inside the lab.</h2><p>A p/xmr-inspired Monero regtest experiment. Test funds only, with no XMR backing or affiliation with Monero or p/xmr.</p></div><a className="underlined-link" href="/lab">Explore the research</a></section>
  <section className="home-disclosures" aria-label="Launch disclosures"><LaunchDisclosure/></section>
  <section className="closing-cta" aria-labelledby="closing-heading"><div><p className="overline">YOUR NEXT BEGINNING</p><h2 id="closing-heading">One idea.<br/>Make it yours.</h2><p>Shape your token. Review the conditions. You make the call.</p></div><a href="/launch" className="action-button action-light">Create a token</a></section>
  <SiteFooter/>
 </main>;
}
