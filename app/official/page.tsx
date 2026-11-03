import "@/app/marketing-refinements.css";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SITE } from "@/lib/site-config";
import { PLATFORM_SETTINGS } from "@/lib/platform-settings.mjs";
import { REWARDS_DEPLOYMENT } from "@/lib/rewards-deployment.mjs";
import { grainpadPlatformId } from "@/lib/platform-policy";
import "../transparency/transparency.css";
import "../docs/docs.css";

// The Raydium CPMM pool GRAIN graduated into on 2026-10-06 (wXMR quote).
const OFFICIAL_GRAIN_POOL = "FPEUEpKXztY3sQh6hhEYnuDTdmGRWKoHPpLoPEf8ge8q";

export const metadata: Metadata = {
  title: "Official addresses · grainpad",
  description: "The official GRAIN token, the addresses grainpad uses and its official links. Other tokens using the Grainpad or GRAIN name are not grainpad's.",
  alternates: { canonical: `${SITE.origin}/official` },
};

function Address({ label, address, note, token = false }: { label: string; address: string; note: string; token?: boolean }) {
  return <div className="docs-address-row"><dt>{label}</dt><dd>
    <a href={`https://solscan.io/${token ? "token" : "account"}/${address}`} target="_blank" rel="noreferrer" aria-label={`${label}: ${address} on Solscan`}><code>{address}</code><span className="docs-explorer">Solscan</span></a>
    <small>{note}</small>
  </dd></div>;
}

export default function OfficialPage() {
  const mint = REWARDS_DEPLOYMENT.officialGrainMint;
  return <main className="shell record-shell grain-updates">
    <a className="skip-content" href="#main-content">Skip to official addresses</a><SiteHeader/>
    <header className="page-heading record-heading" id="main-content"><div><p className="eyebrow"><span className="gx-word">grainpad</span> / OFFICIAL</p><h1>official addresses<span>.</span></h1></div><a href="/authority" className="record-link">Who controls what</a></header>
    <div className="docs-section-body">
      <div className="docs-callout"><strong>only one official GRAIN<span className="gx-dot">.</span></strong><p>Other tokens on pump.fun and other launchpads use the name Grainpad or GRAIN. They are not ours, and grainpad has no connection to them. The official GRAIN mint is the address below. A matching suffix alone proves nothing, so always compare the full address. grainpad will never message you first or ask for your seed phrase.</p></div>
      <h2>GRAIN token</h2>
      <dl className="docs-addresses" aria-label="Official GRAIN token">
        <Address label="GRAIN mint" address={mint} token note="The only official GRAIN · Token-2022 on Solana · launched 6 October 2026"/>
        <Address label="GRAIN pool" address={OFFICIAL_GRAIN_POOL} note="Raydium CPMM pool, GRAIN against wXMR"/>
      </dl>
      <h2>grainpad platform</h2>
      <dl className="docs-addresses" aria-label="grainpad platform addresses">
        <Address label="Platform config" address={grainpadPlatformId().toBase58()} note="grainpad's Raydium LaunchLab platform config · every grainpad launch uses it"/>
        <Address label="Admin" address={PLATFORM_SETTINGS.admin} note="Configuration authority and platform revenue recipient"/>
        <Address label="Collector" address={PLATFORM_SETTINGS.feeWallet} note="Claims platform fees, holds the Fee Keys and collects transfer tax for rewards and burns"/>
      </dl>
      <p className="docs-note">These addresses are read from the published source. Check their live state on <a href="/authority">who controls what</a> and <a href="/platform">platform status</a>.</p>
      <h2>official links</h2>
      <ul className="docs-links">
        <li><span>Website</span><a href={SITE.origin}>grainpad.fun</a></li>
        <li><span>X</span><a href={SITE.twitter} target="_blank" rel="noreferrer">x.com/GrainXMR</a></li>
        <li><span>Discord</span><a href={SITE.discord} target="_blank" rel="noreferrer">discord.gg/PPDYqv4KWa</a></li>
        <li><span>GitHub</span><a href={SITE.github} target="_blank" rel="noopener noreferrer">github.com/graindotfun/grainpad</a></li>
      </ul>
    </div>
    <SiteFooter showResearchDisclaimer={false}/>
  </main>;
}
