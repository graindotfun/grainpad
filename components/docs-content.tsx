"use client";
import "@/app/marketing-refinements.css";
import {BRAND_CHAIN} from "@/lib/brand-presentation";
import {GraduationCoverage} from "@/components/graduation-coverage";
import { useEffect, useState, type ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { KineticText } from "@/components/kinetic-text";
import { DOCS, docsDate } from "@/lib/docs-config";
import {WxmrWarning} from "@/components/wxmr-warning";
import { SITE } from "@/lib/site-config";
import { MoneroLiveRecord, MoneroProofLists, MoneroRecordStatus } from "@/components/monero-record-panel";
import { GRN1, MONERO_NARRATIVE, MONERO_RECORD_FACTS, MONERO_RECORD_LIMITS, moneroProofStatus } from "@/lib/monero-record-status.mjs";
import type { PlatformStatus } from "@/lib/platform-policy";

const sections = [
  ["overview", "Overview"], ["launch-flow", "Launch flow"],
  ["launch-parameters", "Launch parameters"], ["fees", "Fees"],
  ["graduation", "Graduation"], ["grain-and-treasury", "$GRAIN and Treasury"],
  ["trust-model", "How Grainpad is managed"], ["verification", "Verification"],
  ["monero-records", "Monero launch records"], ["pxmr-research", "Early p/xmr research"],
  ["official-links", "Official links"],
] as const;
type ReadState = "loading" | "ready" | "unavailable";
type TokenRecord = { mint: string };

function Section({ index, children }: { index: number; children: ReactNode }) {
  const [id, title] = sections[index];
  return <section id={id} className="docs-section" aria-labelledby={`${id}-heading`}>
    <div className="docs-section-heading"><span>{String(index + 1).padStart(2, "0")} /</span><h2 id={`${id}-heading`}>{title}</h2></div>
    <div className="docs-section-body">{children}</div>
  </section>;
}

function Address({ label, address, note, token = false }: { label: string; address?: string | null; note: string; token?: boolean }) {
  return <div className="docs-address-row"><dt>{label}</dt><dd>
    {address ? <a href={`https://solscan.io/${token ? "token" : "account"}/${address}`} target="_blank" rel="noreferrer" aria-label={`${label}: ${address} on Solscan`}><code>{address}</code><span className="docs-explorer">Solscan</span></a> : <span className="docs-placeholder">—</span>}
    <small>{note}</small>
  </dd></div>;
}

export function DocsContent({ platformId, rates }: { platformId: string; rates: { creator: number; platform: number; protocol: number } }) {
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [platformState, setPlatformState] = useState<ReadState>("loading");
  const [token, setToken] = useState<TokenRecord | null>(null);
  const [tokenState, setTokenState] = useState<ReadState>("loading");
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const timeout = setTimeout(() => controller.abort(), 15000);
    async function read<T>(path: string): Promise<T> {
      const response = await fetch(path, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw Error("Verification unavailable");
      return response.json() as Promise<T>;
    }
    const platformRead = read<PlatformStatus>("/api/platform").then(data => {
      if (typeof data.active !== "boolean" || data.platformId !== platformId) throw Error("Unexpected platform");
      if (current) { setPlatform(data); setPlatformState("ready"); }
    }).catch(() => { if (current) setPlatformState("unavailable"); });
    const tokenRead = read<{ token: TokenRecord | null }>("/api/token").then(data => {
      if (data.token !== null && (!data.token || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(data.token.mint))) throw Error("Unexpected token");
      if (current) { setToken(data.token); setTokenState("ready"); }
    }).catch(() => { if (current) setTokenState("unavailable"); });
    void Promise.allSettled([platformRead, tokenRead]).then(() => clearTimeout(timeout));
    return () => { current = false; clearTimeout(timeout); controller.abort(); };
  }, [platformId]);

  const active = platformState === "ready" && platform?.active === true;
  const feeStatus = active
    ? `Active on mainnet${DOCS.feesActiveSince ? ` since ${docsDate(DOCS.feesActiveSince)}` : " · activation date not recorded"}`
    : platformState === "ready" ? "Proposed · not active on mainnet yet"
    : platformState === "unavailable" ? "Mainnet status unavailable" : "Checking mainnet status…";
  const total = rates.creator + rates.platform + rates.protocol;
  const addressNote = active ? "Matches the current mainnet policy" : platformState === "ready" ? "Configured for activation · not yet active" : "From site configuration · mainnet verification pending";

  return <main className="shell docs-shell grain-updates">
    <a className="skip-content" href="#main-content">Skip to documentation</a><SiteHeader/>
    <header className="page-heading docs-heading" id="main-content">
      <div><p className="eyebrow">GRAINPAD / DOCUMENTATION</p><h1><KineticText>Docs.</KineticText></h1><p className="docs-intro">Launch mechanics. Current policy. Verifiable records.</p></div>
      <div className="docs-edition"><span>Last updated</span><time dateTime={DOCS.lastUpdated}>{docsDate(DOCS.lastUpdated)}</time><span>{BRAND_CHAIN.networkLabel} / v1</span></div>
    </header>
    <div className="docs-layout">
      <aside className="docs-index"><nav aria-label="Documentation sections"><p className="eyebrow">ON THIS PAGE</p><ol>{sections.map(([id, title], i) => <li key={id}><a href={`#${id}`}><span>{String(i + 1).padStart(2, "0")}</span>{title}</a></li>)}</ol></nav><a className="docs-status-link" href="/platform">View platform status</a></aside>
      <article className="docs-article" aria-label="Grainpad technical documentation">
        <Section index={0}>
          <p>Grainpad is a Solana token launchpad built on Raydium LaunchLab, inspired by p/xmr. Grainpad does not have its own bonding-curve program. Tokens launch on a bonding curve and are configured to migrate to a Raydium CPMM pool at graduation.</p>
          <p>{MONERO_NARRATIVE} See <a href="#monero-records">Monero launch records</a> for what is recorded and its current status.</p>
          <p>Grainpad is not backed by XMR, operates no bridge, and is not affiliated with Monero or the p/xmr author. The earlier <a href="#pxmr-research">p/xmr research</a> is separate historical research with a regtest demonstration, a guarded stagenet path and mainnet safety guards.</p>
        </Section>
        <Section index={1}>
          <ol className="docs-flow"><li>Set the token name, symbol, description and artwork, then connect Phantom or Solflare.</li><li>Generate the mint address and approve the metadata message. This message publishes the token identity; it does not authorize a payment.</li><li>Review the simulated creation cost, your spending limit, the mint address and current launch conditions.</li><li>Sign the launch transaction in your wallet. Grainpad verifies the on-chain pool and metadata before adding the token to its directory.</li></ol>
          <p>The temporary mint keypair used to produce the lowercase <code>grn</code> address is generated client-side in your browser. An optional import accepts a mint keypair generated locally. In both paths, the mint secret stays in this tab’s memory: it is not uploaded with metadata or saved in browser storage. It signs the token-creation transaction locally.</p>
          <p>Your wallet signing keys remain inside your wallet provider. Refreshing the page clears the mint keypair; submitted transaction identifiers are retained for recovery. A prepared quote expires after 60 seconds.</p>
          <p>Each token has a Grainpad buy/sell page. Curve trades show a simulated quote, fees, price impact and minimum output. Default slippage is 5%, which is a tolerance, not a fee. Wallet approval is required for every trade.</p><a className="docs-related" href="/launch">Open the launch workspace</a>
        </Section>
        <Section index={2}>
          <dl className="docs-facts"><div><dt>Total supply</dt><dd>1,000,000,000 tokens</dd></div><div><dt>Decimals</dt><dd>6</dd></div><div><dt>Offered on the curve</dt><dd>793,100,000 tokens</dd></div><div><dt>Reserved for migration liquidity</dt><dd>206,900,000 tokens</dd></div><div><dt>Graduation target</dt><dd>20 wXMR · rewards launch</dd></div></dl>
          <p>The rewards launch target is 20 wXMR in trading reserves raised by the curve, not a creation fee. Creation costs are quoted separately through simulation. New reward launches use Token-2022 with a creator-selected transfer tax from 1% to 3%; the slider moves in 0.1% steps. The program accepts whole basis points within this range.</p><h3>Required holder rewards · awaiting activation</h3><p>Transfer tax is withheld in the launched token. The proposed operator would convert it to wXMR for holder payments and a GRAIN buy-and-burn reserve. The owner has selected the collector’s public wallet address; its on-chain configuration has not been applied and the operating policy remains unapproved. Rewards are not active. Grainpad has no implemented share of the token tax. <a href="/rewards">View distribution status and verified receipts</a>.</p><p>Finalized configuration read slot: {platform?.slot??"UNKNOWN"}. The previous 1b setup uses ordinary SPL tokens and SOL/wXMR rules. Rewards require a separately reviewed configuration: wXMR only, Token-2022, a 1–3% tax range, the existing billion-token supply and exact 20 wXMR graduation target. Token creation remains locked.</p><p>The creator chooses the tax before launch and has no tax-edit control in Grainpad. LaunchLab initially controls the tax configuration; after migration that authority passes to the configured Grainpad collector. It is not permanently immutable. The founder admin can also change platform rules and trading fees. Current settings are checked before launch and shown on each token’s proof page.</p><h3>Paired with wXMR</h3><WxmrWarning/>
        </Section>
        <Section index={3}>
          <p className={`docs-status${active ? " is-active" : ""}`} role="status">{feeStatus}</p>
          <p>{active ? `The verified Grainpad configuration sets a ${total}% base trading fee during the bonding-curve phase.` : `The published policy proposes a ${total}% base trading fee during the bonding-curve phase. It applies only after Grainpad’s platform configuration is activated and verified on mainnet.`}</p>
          <div className="economics-grid docs-fees"><div><strong>{rates.creator}<span>%</span></strong><p>Token creator</p></div><div><strong>{rates.platform}<span>%</span></strong><p>Grainpad</p></div><div><strong>{rates.protocol}<span>%</span></strong><p>Raydium protocol</p></div></div>
          <p>The token transfer tax is additional to these trading fees. Network fees, slippage and any third-party trading or referral fees are also separate. The {total}% curve split does not carry over after graduation. Earlier tokens launched under another platform retain that platform’s configuration.</p>
          <p className="docs-note">New Grainpad launches are blocked unless the current on-chain settings match the published policy. {platformState === "unavailable" ? "The current configuration could not be verified; the figures above are policy values, not a live fee quote." : "The admin can edit platform settings and fees after this check."}</p>
          <a className="docs-related" href="/platform">Check the current platform configuration</a>
        </Section>
        <Section index={4}>
          <p>At the 20 wXMR reserve target for new rewards launches, the pool becomes eligible for migration to a Raydium CPMM pool. Execution depends on Raydium’s migration service.</p>
          <p>On successful migration, the configuration locks 100% of the initial LP and assigns the initial Fee Key to Grainpad’s dedicated admin wallet. The Fee Key is a transferable NFT that permits claims on accrued LP trading fees; it does not permit withdrawal of the locked principal. After migration, the selected CPMM config CRRS5ieQmBrZjWhcj99JuGrT5tyuWDaGAXLXLFjbAtjQ charges a 0.25% trade fee plus a separate 1% creator fee charged in the quote asset. The previously considered D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2 config has a 0.05% creator fee; it is not selected for this launch. The creator fee is additional to the trade fee; the platform Fee Key receives LP-fee rights, not this creator fee.</p>
          <div className="docs-callout"><strong>Graduation support confirmation and audit evidence</strong><GraduationCoverage/><p>Create, buy, sell, lazy fee-vault initialization, curve claims, curve completion, migration, post-graduation swaps, creator claims and Fee Key claims passed in unsigned local simulations for both quotes using cloned mainnet programs. The local fixture substituted the migration authority and token balances. It did not test Raydium’s real mainnet migration keeper end-to-end for Grainpad. The migrate instruction requires Raydium’s configured migration signer; there is no verified permissionless fallback. A completed curve can remain paused until Raydium processes it.</p></div>
          <p>While migration is pending the token page says “Graduating to Raydium. Trading pauses until migration finishes. Usually seconds; not guaranteed.” and shows the lifecycle: curve complete, migration pending, Raydium pool live. Once its CPMM pool is verified, the token page uses the CPMM route and also links to Raydium.</p><p>. These are local simulation fixtures, not mainnet transactions. The on-chain sample and Raydium support’s platform-wide confirmation are separate evidence. Grainpad’s first completed curve remains monitored for a migration delay exceeding 10 minutes.</p>
        </Section>
        <Section index={5}>
          <p>$GRAIN is the Grainpad project token. Two separate flows can buy and burn it. First, 15% of the wXMR converted from reward-launch transfer taxes is reserved for GRAIN purchases and burns (85% goes to holders); see <a href="/rewards">Rewards</a>. Second, the treasury policy allocates 30% of eligible, verified LaunchLab platform fees collected in SOL (claimed as wSOL) to buying and burning $GRAIN. The remaining 70% of those SOL fees supports operations, before expenses.</p>
          <p>Official GRAIN has not been created. It is prepared as a restricted Grainpad launch paired with wXMR, like other reward launches: 1 billion tokens, 6 decimals, 793.1 million curve tokens, a 20 wXMR curve target, and a Token-2022 transfer tax between 1% and 3% that the owner sets before creation. SOL buys and sells route through the SOL/wXMR pool once Grainpad’s lookup table exists and SOL trading is enabled. Creation requires the owner’s wallet signature. Treasury buybacks are manual and also require the owner’s signature; no contract forces the owner to spend the allocation. A purchase and its burn are prepared as one atomic transaction; completed activity is recorded receipt by receipt on the <a href="/treasury">Treasury / Public Record</a> page.</p>
          <p>The current ledger excludes creator fees, trading reserves and post-graduation LP claims. Fees generated by the treasury’s own buybacks are deducted from eligible revenue. No collected fees means no funded buyback. The first collected fees may remain available for network operations; any unspent buyback allocation stays visible in Treasury. The policy is not an automatic payout. The 30% buyback policy applies only to SOL fees in v1. wXMR fees are tracked separately in wXMR, with no buyback allocation and no conversion to SOL or GRAIN. They do not count as completed buybacks or burns.</p>
          <p>$GRAIN grants no right to revenue, yield, dividends or redemption. Buybacks do not guarantee any token price.</p>
        </Section>
        <Section index={6}>
          <p>Grainpad is an ambitious project built by a small team. We want to be clear about how the platform is managed today and what we plan to improve as we grow.</p>
          <p>Today, a dedicated, founder-controlled wallet manages Grainpad’s Raydium LaunchLab configuration. The same wallet is assigned to receive platform fees, the migration Fee Key and any platform vesting allocation. These roles currently share one signing key.</p>
          <p>Within the protocol’s limits, the admin can update platform fees, fee recipients and migration settings, and change or remove launch rules. Platform fee changes can affect existing bonding-curve pools. The launch page checks current settings, but those checks do not prevent later admin changes.</p>
          <p>Moving to a Squads multisig with multiple approvals and a timelock that delays changes is a high development priority. Neither control is active today, and we have not committed to a deployment date. We plan to introduce them for new launches. Tokens created under the current configuration would remain under its existing admin: the reviewed LaunchLab interface does not support transferring that authority.</p>
        </Section>
        <Section index={7}>
          <p>Use the exact addresses below. The official mint is read from Grainpad’s published token record, which requires owner approval and a PASS from verify-launch before publication. The verifier checks finalized platform, pool, fees, supply, authorities, curve parameters, content-addressed metadata and image, project links, and no developer purchase in the creation transaction. It also checks the founder’s observed token balance. It does not establish future behaviour. Every listed token has a proof page and JSON API showing the quote asset, individual rule checks, rule accounts and finalized read slot. A mismatch fails closed.</p>
          <dl className="docs-addresses" aria-label={`${BRAND_CHAIN.networkLabel} verification addresses`}>
            <Address label="GRAIN Mint" address={token?.mint} token note={tokenState === "loading" ? "Checking the official token record…" : tokenState === "unavailable" ? "Official token record unavailable · no address substituted" : token ? "Published after finalized mainnet identity checks" : "Not published yet · awaiting a verified launch"}/>
            <Address label="Platform Config" address={platformId} note={addressNote}/>
            <Address label="Admin" address={active ? platform?.configurationAuthority : SITE.projectWallet} note={active ? "Current configuration authority" : "Configured owner wallet · not a token mint"}/>
            <Address label="Fee Wallet" address={active ? platform?.feeWallet : SITE.projectWallet} note={active ? "Current platform fee recipient · same wallet as Admin" : "Configured fee recipient · pending mainnet verification"}/>
          </dl>
          <p className="docs-note">Solscan links point to Solana mainnet. A configured address alone does not prove that its account exists or is active. The future Fee Key NFT is specific to a migrated pool; no mainnet Fee Key address is published here.</p>
          <p>The <code>grn</code> suffix is enforced only for launches through grainpad.fun. It is an identity convention, not authentication. Anyone can generate an address ending in <code>grn</code>. Verify the token’s pool, its platform configuration and its Grainpad listing.</p>
        </Section>
        <Section index={8}>
          <p>{MONERO_NARRATIVE}</p>
          <MoneroRecordStatus/>
          <MoneroLiveRecord/>
          <ul className="monero-limits">{MONERO_RECORD_FACTS.map(line => <li key={line}>{line}</li>)}</ul>
          <h3>What it is not</h3>
          <ul className="monero-limits">{MONERO_RECORD_LIMITS.map(line => <li key={line}>{line}</li>)}</ul>
          <div className="docs-callout"><strong>Proof status</strong><MoneroProofLists/><p>{moneroProofStatus().caveat}</p></div>
          <a className="docs-related" href={GRN1.spec} target="_blank" rel="noreferrer">Read the {GRN1.magic} v{GRN1.version} specification</a>
        </Section>
        <Section index={9}>
          <p>Before the Monero record layer, Grainpad built a research implementation of the p/xmr registry. It is historical research, not the production record path. It ran on Monero regtest (fakechain) only, using test funds, with no mainnet execution and no XMR20 compatibility.</p>
          <p>There is no live Monero engine, native XMR settlement or XMR redemption. The research does not back $GRAIN or any token launched on Solana. An independent Grainpad curve, GRAIN as a quote asset and holder discounts are research only. We do not claim the same protocol or exact curve as p/xmr.</p>
          <p><a href="/rewards">wXMR holder rewards and tax-funded GRAIN burns</a> are required before token launches open. They are being implemented and are not active yet.</p>
          <a className="docs-related" href="/lab">Open the Monero lab: records and early research</a>
          <p>Read the <a href="/roadmap">Monero roadmap</a> and the <a href="/transparency">donation commitment and public receipts</a>.</p>
        </Section>
        <Section index={10}>
          <p>The official GRAIN CA is published only on grainpad.fun and @GrainXMR after verification. Until then, no official CA is published. Display or trading support on Axiom, GMGN, Photon, Padre, Dexscreener and other external interfaces is not guaranteed.</p><p>Primary references: <a href="https://github.com/raydium-io/raydium-idl/blob/master/raydium_launchpad/raydium_launchpad.json" target="_blank" rel="noreferrer">LaunchLab IDL</a>, <a href="https://docs.raydium.io/products/launchlab/platform-config" target="_blank" rel="noreferrer">platform configuration</a>, <a href="https://docs.raydium.io/products/launchlab/instructions" target="_blank" rel="noreferrer">migration instructions</a>.</p><ul className="docs-links"><li><span>Website</span><a href={SITE.origin} target="_blank" rel="noreferrer">grainpad.fun</a></li><li><span>X / Twitter</span><a href={SITE.twitter} target="_blank" rel="noreferrer">x.com/GrainXMR</a></li><li><span>Public record</span><a href="/treasury">Treasury</a></li><li><span>Configuration</span><a href="/platform">Platform status</a></li><li><span>Research</span><a href="/lab">Monero lab</a></li></ul>
        </Section>
      </article>
    </div>
    <SiteFooter/>
  </main>;
}
