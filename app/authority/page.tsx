import "@/app/marketing-refinements.css";
import "@/app/transparency/transparency.css";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AuthorityLedgerView } from "@/components/authority-ledger-view";
import { SITE } from "@/lib/site-config";
import "./authority.css";

export const metadata: Metadata = {
  title: "Who controls what — Grainpad",
  description: "Every Grainpad authority, who holds it, what it can do, and how to check it on chain yourself.",
  alternates: { canonical: `${SITE.origin}/authority` },
};

export default function AuthorityPage() {
  return <main className="shell record-shell grain-updates">
    <a className="skip-content" href="#main-content">Skip to authorities</a><SiteHeader/>
    <header className="page-heading record-heading" id="main-content"><div><p className="eyebrow">GRAINPAD / PUBLIC RECORD</p><h1>Who controls what<span>.</span></h1></div><a href="/transparency" className="record-link">Transparency</a></header>
    <section className="record-commitment" aria-labelledby="authority-intro">
      <h2 id="authority-intro">How to read this page</h2>
      <div>
        <p>Each entry names one power over Grainpad tokens, funds or launches, who holds it today, and whether it can move or redirect money. Values marked as read on chain come from a finalized Solana read and link to two explorers. Values marked as Grainpad statements describe off-chain control that no chain read can show; treat them as claims.</p>
        <p>Nothing here is decentralized yet. Grainpad still holds single-key control over the legacy platform and over tax withdrawal. This page exists so you can see exactly where.</p>
      </div>
    </section>
    <AuthorityLedgerView/>
    <section className="record-commitment" aria-labelledby="verify-heading">
      <h2 id="verify-heading">Check it yourself</h2>
      <div>
        <p>Do not rely on this page. With your own RPC endpoint and a checkout of the published source, run the read-only watcher. It discovers every launch on the platform directly from chain and never signs or sends.</p>
        <pre className="ledger-code"><code>{"SOLANA_RPC_URL=https://your-rpc node scripts/watch-authorities.mjs\nSOLANA_RPC_URL=https://your-rpc node scripts/review-fee-freeze.mjs --grain"}</code></pre>
        <p>Or read any account directly: <code>solana account &lt;address&gt; --output json</code>, then decode the Token-2022 transfer-fee extension or the LaunchLab platform account.</p>
      </div>
    </section>
    <SiteFooter showResearchDisclaimer={false}/>
  </main>;
}
