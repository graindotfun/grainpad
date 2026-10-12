import "@/app/marketing-refinements.css";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { MoneroDisclaimer } from "@/components/monero-disclaimer";
import { MONERO_ROADMAP } from "@/lib/monero-content.mjs";
import { SITE } from "@/lib/site-config";
import "../transparency/transparency.css";

export const metadata: Metadata = {
  title: "Roadmap — grainpad",
  description: "grainpad's Monero launch records, planned Monero open-source support and exploratory research.",
  alternates: { canonical: `${SITE.origin}/roadmap` },
};

export default function RoadmapPage() {
  return <main className="shell record-shell grain-updates">
    <a className="skip-content" href="#main-content">Skip to roadmap</a><SiteHeader/>
    <header className="page-heading record-heading" id="main-content"><div><p className="eyebrow"><span className="gx-word">grainpad</span> / ROADMAP</p><h1>roadmap<span>.</span></h1></div><a href="/transparency" className="record-link">View transparency</a></header>
    <ol className="roadmap-items" aria-label="Monero roadmap">
      {MONERO_ROADMAP.map(item => <li key={item.title}><article><p className={`roadmap-status${item.status === "Planned" ? " is-planned" : ""}`}>[{item.status}]</p><div><h2>{item.title}</h2><p>{item.description}</p></div></article></li>)}
    </ol>
    <MoneroDisclaimer/>
    <SiteFooter showResearchDisclaimer={false}/>
  </main>;
}
