"use client";
import "@/app/marketing-refinements.css";
import {BRAND_CHAIN} from "@/lib/brand-presentation";
import {HeroFeatures,SiteStats,useSiteOverview} from "@/components/site-overview";
import {TokenDiscovery} from "@/components/token-discovery";
import Image from "next/image";
import {ArrowUpRight,ArrowDown,Plus,FlaskConical} from "lucide-react";
import {SiteHeader} from "@/components/site-header";
import {GenesisField} from "@/components/genesis-field";
import {KineticText} from "@/components/kinetic-text";
import {TokenTape} from "@/components/token-tape";
import {LaunchDisclosure} from "@/components/launch-disclosure";
import {OfficialLinksNotice} from "@/components/official-links-notice";
import {SiteFooter} from "@/components/site-footer";
import {useLaunchStatus} from "@/components/use-launch-status";
import {LaunchDesk} from "@/components/launch-desk";
import {MONERO_NARRATIVE,moneroRecordSummary} from "@/lib/monero-record-status.mjs";

export function Home({initialOverview,initialDiscovery}:{initialOverview:import("@/components/site-overview").SiteOverviewData|null;initialDiscovery:import("@/lib/token-discovery").DiscoveryResult|null}){
 const overview=useSiteOverview(initialOverview);
 const {status}=useLaunchStatus();
 const launchesOpen=status.state==='open';
 return <main className="landing-shell grain-updates">
  <a className="skip-content" href="#main-content">Skip to content</a><SiteHeader/>
  <section className="brand-hero" id="main-content" aria-labelledby="hero-heading">
   <div className="hero-copy"><p className="overline"><span className="hero-network"><span className="orange-square"/> {BRAND_CHAIN.label.toUpperCase()}</span> IDEAS INTO EXISTENCE</p>
    <h1 id="hero-heading"><span className="hero-opening"><KineticText>Your idea.</KineticText></span><br/><span className="hero-soft">On-chain<span className="hero-dot">.</span></span></h1>
    <p className="hero-description">Create your token. Shape what comes next.<br/>Clear launch conditions. Your wallet. Your call.</p>
    <OfficialLinksNotice/>
    <HeroFeatures data={overview}/>
    <div className="hero-actions"><a href="/launch" className="action-button action-light">Create a token <ArrowUpRight size={20}/></a><a href="#launches" className="action-text">Explore launches <ArrowDown size={17}/></a></div>
    <a className="hero-status" href="/platform"><span className={`status-indicator ${launchesOpen?"is-active":""}`}/><span>{status.label}</span><ArrowUpRight size={12}/></a>
   </div><div className="hero-art"><GenesisField/></div>
   <div className="hero-baseline"><span><i/> FROM FIRST IDEA TO FIRST BLOCK.</span><a href="#approach">Discover the approach <ArrowDown size={13}/></a></div>
  </section>
  <LaunchDesk status={status}/>
  <TokenTape hideEmpty={!overview?.launches}/>
  <SiteStats data={overview}/>
  <div className="technology-line"><span className="overline">THE FOUNDATION</span><span className="technology-name"><Image unoptimized className="solana-logo" src="/brand/solana-sol-icon.svg" alt="" width={24} height={19}/>{BRAND_CHAIN.label}</span><span className="technology-separator"/><span className="technology-name raydium-name"><Image unoptimized className="raydium-logo" src="/brand/raydium-logo.svg" alt="" width={22} height={26}/>Raydium <span>LaunchLab</span></span><span className="technology-separator"/><span className="technology-name monero-name"><Image unoptimized className="monero-logo" src="/brand/monero-symbol.svg" alt="" width={22} height={22}/>Monero <span>wXMR</span></span><span className="technology-note">New launches pair with wXMR on Raydium LaunchLab.<br/>Grainpad’s public record on top.</span></div>
  <section className="approach-section" id="approach" aria-labelledby="approach-heading">
   <div className="section-intro"><p className="overline"><span className="section-number">01 /</span> A BETTER START</p><h2 id="approach-heading">The next move<br/><span>is yours.</span></h2><p>Name it, check the exact conditions, sign in your own wallet. Nothing is sent until you approve it.</p><a href="/launch" className="underlined-link">Inside the workspace <ArrowUpRight size={17}/></a></div>
   <div className="approach-steps"><article><span className="approach-number">01</span><div><h3>Give it an identity.</h3><p>A name, a symbol, a story. Compose your token and see its identity take shape before you connect.</p></div><span className="step-glyph"><Plus size={24}/></span></article><article><span className="approach-number">02</span><div><h3>See the whole picture.</h3><p>Review supply, launch conditions and estimated costs. Set a spending limit before signing.</p></div><span className="step-glyph"><span className="review-glyph"/></span></article><article><span className="approach-number">03</span><div><h3>Make the final call.</h3><p>Approve the transaction in your own wallet. A submitted launch becomes a listing only after verification.</p></div><span className="step-glyph"><ArrowUpRight size={24}/></span></article></div>
  </section>
  <TokenDiscovery initialData={initialDiscovery}/>
  <section className="principles-section" aria-labelledby="principles-heading"><div className="principles-title"><p className="overline"><span className="section-number">03 /</span> CLEAR BY DESIGN</p><h2 id="principles-heading">The details<br/>are the difference<span>.</span></h2><a href="/docs" className="underlined-link">Read the Docs <ArrowUpRight size={17}/></a></div><div className="principles-list"><div><span>01</span><h3>Conditions you can inspect.</h3><p>Platform configuration, fee destinations and activation status are available to check.</p></div><div><span>02</span><h3>Your signature. Your decision.</h3><p>Preparing a launch is separate from signing it. Nothing launches without your approval.</p></div></div></section>
  <section className="research-card" aria-labelledby="research-heading"><div><p className="overline"><FlaskConical size={15}/> MONERO LAB</p><h2 id="research-heading">Inside the lab.</h2><p>{MONERO_NARRATIVE} {moneroRecordSummary()} The lab shows the record format beside the earlier regtest-only p/xmr research. No XMR backing, no bridge, and no affiliation with Monero or p/xmr.</p></div><a className="underlined-link" href="/lab">Open the Monero lab</a></section>
  <section className="home-disclosures" aria-label="Launch disclosures"><LaunchDisclosure/></section>
  <section className="closing-cta" aria-labelledby="closing-heading"><div><p className="overline">YOUR NEXT BEGINNING</p><h2 id="closing-heading">One idea.<br/>Make it yours.</h2><p>Shape your token. Review the conditions. You make the call.</p></div><a href="/launch" className="action-button action-light">Create a token</a></section>
  <SiteFooter/>
 </main>;
}
