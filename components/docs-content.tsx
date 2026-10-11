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
import {WalletsFaq,type FaqPlatform} from "@/components/wallets-faq";
import {WxmrUnwrapLink} from "@/components/wxmr-wallet-note";

const sections = [
  ["overview", "Overview"], ["launch-flow", "Launch flow"],
  ["launch-parameters", "Launch parameters"], ["fees", "Fees"],
  ["graduation", "Graduation"], ["grain-and-treasury", "$GRAIN and Treasury"],
  ["trust-model", "How Grainpad is managed"], ["verification", "Verification"],
  ["monero-records", "Monero launch records"], ["pxmr-research", "Early p/xmr research"],
  ["official-links", "Official links"], ["faq", "Wallets & FAQ"],
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

export function DocsContent({ platformId, rates, solTradingEnabled, solLookupConfigured }: { platformId: string; rates: { creator: number; platform: number; protocol: number }; solTradingEnabled:boolean; solLookupConfigured:boolean }) {
  const [platform, setPlatform] = useState<FaqPlatform | null>(null);
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
    const platformRead = read<FaqPlatform>("/api/platform").then(data => {
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
  const feesConfigured = platformState === "ready" && !platform?.stale && platform?.exists === true && platform.protocolRate === Math.round(rates.protocol * 10000) && platform.platformRate === Math.round(rates.platform * 10000) && platform.creatorRate === Math.round(rates.creator * 10000);
  const feeStatus = active
    ? `Active on mainnet${DOCS.feesActiveSince ? ` since ${docsDate(DOCS.feesActiveSince)}` : " · activation date not recorded"}`
    : feesConfigured ? "Configured on mainnet · public creation not active"
    : platformState === "ready" ? "Published policy · current configuration does not match"
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
          <ol className="docs-flow"><li>Set the token name, symbol, description and artwork, then connect Phantom or Solflare.</li><li>Reserve a mint address from the available inventory or import a locally generated mint, then approve the metadata message. This message publishes the token identity; it does not authorize a payment.</li><li>Review the simulated creation cost, your spending limit, the mint address and current launch conditions.</li><li>Sign the launch transaction in your wallet. Grainpad verifies the on-chain pool and metadata before adding the token to its directory.</li></ol>
          <p>Public token launches require an address ending in lowercase <code>grn</code>. Official GRAIN uses the separate <code>grain</code> suffix. A finite protected inventory supplies mint-only keypairs, allocated permanently to the authenticated creator. The mint secret is returned encrypted for that creator’s browser; it is never included in public metadata. You can also import a matching mint keypair generated locally. If inventory is unavailable, creation waits for a refill or a valid import; there is no random-address fallback.</p>
          <p>Your wallet signing keys remain inside your wallet provider. The separate mint key signs token creation locally in the browser. An inventory allocation can be recovered by the same creator wallet; an imported mint must be retained by its owner. Submitted transaction identifiers are retained for recovery. A prepared quote expires after 60 seconds.</p>
          <p>Each token has a Grainpad buy/sell page. Curve trades show a simulated quote, fees, price impact and minimum output. Default slippage is 5%, which is a tolerance, not a fee. Wallet approval is required for every trade.</p><a className="docs-related" href="/launch">Open the launch workspace</a>
        </Section>
        <Section index={2}>
          <dl className="docs-facts"><div><dt>Total supply</dt><dd>1,000,000,000 tokens</dd></div><div><dt>Decimals</dt><dd>6</dd></div><div><dt>Offered on the curve</dt><dd>793,100,000 tokens</dd></div><div><dt>Reserved for migration liquidity</dt><dd>206,900,000 tokens</dd></div><div><dt>Graduation target</dt><dd>20 wXMR · rewards launch</dd></div></dl>
          <p>The rewards launch target is 20 wXMR in trading reserves raised by the curve, not a creation fee. Creation costs are quoted separately through simulation. New reward launches use Token-2022 with a creator-selected transfer tax from 1% to 3%; the slider moves in 0.1% steps. The program accepts whole basis points within this range.</p><h3>Launch post</h3><p>Add a specific X post in the optional Launch post field, separate from the project’s X profile. After launch, the registered creator can attach, replace or remove this link from the token page by signing a message. Later edits are recorded separately and do not rewrite the token’s signed metadata. Grainpad links to the post; it does not verify the post’s content or authorship on X.</p><h3>Required holder rewards</h3><p>Transfer tax is withheld in the launched token. The collector operator converts verified tax to wXMR: 50% is allocated to holders of that token, 15% to official GRAIN purchases and burns, and 35% to Grainpad. Existing frozen sources retain their original split. The collector is configured on chain and the operator spending policy is approved. Live operation and verified distribution receipts remain separate activation checks. <a href="/rewards">View the current distribution status and verified receipts</a>.</p><p>Rewards may be paid later than allocation. Selling tokens does not transfer previously assigned rewards to the next holder; only unallocated holder-allocation rounding can enter a later holder snapshot. The owner approved a target of retaining at least 50% of conservatively quoted gross platform revenue after full workflow costs. The collector batches payments and checks their operating cost before admitting a round; this target does not guarantee realized profit or payment frequency. Half of each new platform share is reserved for approved operating gas: 17.5% of total converted revenue; the other 17.5% is allocated to the platform recipient. Existing frozen sources retain their original routing.</p><p>Finalized configuration read slot: {platform?.slot??"UNKNOWN"}. Rewards launches pair with wXMR and use Token-2022, a 1–3% tax range, the billion-token supply and exact 20 wXMR graduation target. The previous untaxed 1b configuration is superseded. Token creation remains locked until policy, operational and public-admission checks pass.</p><p>The creator chooses the tax before launch and has no tax-edit control in Grainpad. LaunchLab initially controls the tax configuration; after migration that authority passes to the configured Grainpad collector. It is not permanently immutable. The founder admin can also change platform rules and trading fees. Current settings are checked before launch and shown on each token’s proof page.</p><h3>Paired with wXMR</h3><WxmrWarning/><WxmrUnwrapLink/>
        </Section>
        <Section index={3}>
          <p className={`docs-status${active ? " is-active" : ""}`} role="status">{feeStatus}</p>
          <p>{feesConfigured ? `The verified Grainpad configuration sets a ${total}% base trading fee during the bonding-curve phase. Public admission has a separate activation gate.` : `The published policy proposes a ${total}% base trading fee during the bonding-curve phase. It applies only after Grainpad’s platform configuration is activated and verified on mainnet.`}</p>
          <div className="economics-grid docs-fees"><div><strong>{rates.creator}<span>%</span></strong><p>Token creator</p></div><div><strong>{rates.platform}<span>%</span></strong><p>Grainpad</p></div><div><strong>{rates.protocol}<span>%</span></strong><p>Raydium protocol</p></div></div>
          <p>The token transfer tax is additional to these trading fees. Network fees, slippage and any third-party trading or referral fees are also separate. The {total}% curve split does not carry over after graduation. Earlier tokens launched under another platform retain that platform’s configuration.</p>
          <p className="docs-note">New Grainpad launches are blocked unless the current on-chain settings match the published policy. {platformState === "unavailable" ? "The current configuration could not be verified; the figures above are policy values, not a live fee quote." : "The admin can edit platform settings and fees after this check."}</p>
          <a className="docs-related" href="/platform">Check the current platform configuration</a>
        </Section>
        <Section index={4}>
          <p>At the 20 wXMR reserve target for new rewards launches, the pool becomes eligible for migration to a Raydium CPMM pool. Execution depends on Raydium’s migration service.</p>
          <p>On successful migration, the configuration locks 100% of the initial LP and assigns the initial Fee Key to Grainpad’s dedicated admin wallet. The Fee Key is a transferable NFT that permits claims on accrued LP trading fees; it does not permit withdrawal of the locked principal. After migration, the selected CPMM config CRRS5ieQmBrZjWhcj99JuGrT5tyuWDaGAXLXLFjbAtjQ charges a 0.25% trade fee plus a separate 1% creator fee charged in the quote asset. The previously considered D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2 config has a 0.05% creator fee; it is not selected for this launch. The creator fee is additional to the trade fee; the platform Fee Key receives LP-fee rights, not this creator fee.</p>
          <div className="docs-callout"><strong>Graduation support confirmation and audit evidence</strong><GraduationCoverage/><p>Create, buy, sell, lazy fee-vault initialization, curve claims, curve completion, migration, post-graduation swaps, creator claims and Fee Key claims passed in unsigned local simulations for both quotes using cloned mainnet programs. The local fixture substituted the migration authority and token balances. It did not test Raydium’s real mainnet migration keeper end-to-end for Grainpad. The migrate instruction requires Raydium’s configured migration signer; there is no verified permissionless fallback. A completed curve can remain paused until Raydium processes it.</p></div>
          <p>While migration is pending the token page says “Graduating to Raydium. Trading pauses until migration finishes. Usually seconds; not guaranteed.” and shows the lifecycle: curve complete, migration pending, Raydium pool live. Once its CPMM pool is verified, the token page uses the CPMM route and also links to Raydium.</p><p>These are local simulation fixtures, not mainnet transactions. The on-chain sample and Raydium support’s platform-wide confirmation are separate evidence. Grainpad’s first completed curve remains monitored for a migration delay exceeding 10 minutes.</p>
        </Section>
        <Section index={5}>
          <p>$GRAIN is the Grainpad project token. Transfer-tax revenue funds its purchase-and-burn path. First, 15% of the wXMR converted from reward-launch transfer taxes is reserved for GRAIN purchases and burns (50% goes to holders and 35% to Grainpad for new revenue; existing recorded allocations retain their original split); see <a href="/rewards">Rewards</a>. Second, the treasury policy allocates 30% of eligible, verified LaunchLab platform fees collected in SOL (claimed as wSOL) to buying and burning $GRAIN. The remaining 70% of those SOL fees supports operations, before expenses. The approved collector path claims platform fees and forwards the operating share to the founder. Before official GRAIN exists, the buyback share stays reserved and the operator performs claims only. The live runtime and finalized receipts are shown on Treasury; source approval alone does not confirm that automation is running.</p>
          <p>The new official GRAIN identity is published only after finalized verification. The approved launch is paired with wXMR, like other reward launches: 1 billion tokens, 6 decimals, 793.1 million curve tokens, a 20 wXMR curve target, and the owner-approved 2% Token-2022 transfer tax. SOL buys and sells route through the SOL/wXMR pool using the Grainpad-owned lookup table after SOL trading is enabled. The approved creation transaction includes the 0.145 wXMR DEV purchase and keeps public wXMR launch admission open; the admin and creator must approve their respective signatures. Buybacks require a separately verified official GRAIN target and the approved collector policy. A purchase and its burn are prepared as one atomic transaction; tax-funded purchases and burns are recorded on <a href="/rewards">Rewards</a>; the separate legacy SOL ledger is on <a href="/treasury">Treasury / Public Record</a>.</p>
          <p>Automatic treasury receipts and the historical owner-managed ledger are separate. Under the approved collector policy, wXMR platform fees are forwarded in full to the founder; SOL platform fees are claimed as wSOL, with 70% forwarded and 30% reserved for GRAIN purchases and burns. This 30% allocation is separate from the 15% transfer-tax burn reserve. Creator fees, trading reserves and holder rewards are not platform revenue. LP/FeeKey claims require a separate custody review. Reserved funds do not count as completed purchases or burns, and budget or network holds can delay execution.</p>
          <p>$GRAIN grants no right to revenue, yield, dividends or redemption. Buybacks do not guarantee any token price.</p>
        </Section>
        <Section index={6}>
          <p>Grainpad is an ambitious project built by a small team. We want to be clear about how the platform is managed today and what we plan to improve as we grow.</p>
          <p>Today, a dedicated, founder-controlled wallet manages Grainpad’s Raydium LaunchLab configuration. The founder retains admin and vesting authority. A separate collector wallet is configured to claim platform fees and forward the approved share to the founder. Migration Fee Key custody and LP automation require their own review. These are distinct authorities, not a multisig approval system.</p>
          <p>Within the protocol’s limits, the admin can update platform fees, fee recipients and migration settings, and change or remove launch rules. Platform fee changes can affect existing bonding-curve pools. The launch page checks current settings, but those checks do not prevent later admin changes.</p>
          <p>Moving to a Squads multisig with multiple approvals and a timelock that delays changes is a high development priority. Neither control is active today, and we have not committed to a deployment date. We plan to introduce them for new launches. Tokens created under the current configuration would remain under its existing admin: the reviewed LaunchLab interface does not support transferring that authority.</p>
        </Section>
        <Section index={7}>
          <p>Use the exact addresses below. The official mint is read from Grainpad’s published token record, which requires owner approval and a PASS from verify-launch before publication. The verifier checks finalized platform, pool, fees, supply, authorities, curve parameters, content-addressed metadata and image, project links, and the exact declared DEV purchase in the creation transaction. The current approved purchase is 0.145 wXMR; its received tokens and the creator’s observed balance are checked against the finalized receipt. It does not establish future behaviour. Every listed token has a proof page and JSON API showing the quote asset, individual rule checks, rule accounts and finalized read slot. A mismatch fails closed.</p>
          <dl className="docs-addresses" aria-label={`${BRAND_CHAIN.networkLabel} verification addresses`}>
            <Address label="GRAIN Mint" address={token?.mint} token note={tokenState === "loading" ? "Checking the official token record…" : tokenState === "unavailable" ? "Official token record unavailable · no address substituted" : token ? "Published after finalized mainnet identity checks" : "Not published yet · awaiting a verified launch"}/>
            <Address label="Platform Config" address={platformId} note={addressNote}/>
            <Address label="Admin" address={active ? platform?.configurationAuthority : SITE.projectWallet} note={active ? "Current configuration authority" : "Configured owner wallet · not a token mint"}/>
            <Address label="Fee Wallet" address={active ? platform?.feeWallet : SITE.projectWallet} note={active ? "Current platform fee recipient · same wallet as Admin" : "Configured fee recipient · pending mainnet verification"}/>
          </dl>
          <p className="docs-note">Solscan links point to Solana mainnet. A configured address alone does not prove that its account exists or is active. The future Fee Key NFT is specific to a migrated pool; no mainnet Fee Key address is published here.</p>
          <p>The <code>grn</code> suffix is required for public token launches through grainpad.fun; the official GRAIN launch requires <code>grain</code>. Existing tokens keep their history. A suffix is an identity convention, not authentication: anyone can generate a matching address. Verify the token’s pool, its platform configuration and its Grainpad listing.</p>
        </Section>
        <Section index={8}>
          <p>{MONERO_NARRATIVE}</p>
          <p>GRAINU has a verified record. New launches enter the automatic Monero publication queue after creator authorization and finalized Solana registration. Publication uses a dedicated funded wallet and bounded fee budget; records can wait for funding, confirmations or recovery. A successful Solana launch alone is not a completed Monero publication.</p>
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
          <p><a href="/rewards">wXMR holder rewards</a> can operate before official GRAIN launches under the original 70% holder / 15% GRAIN reserve / 15% platform split. New revenue now follows 50% / 15% / 35%; previously recorded entitlements retain their original split. Each source token’s GRAIN share stays isolated until the official target and its buyback path are verified. Historical GRAINU payments and its owner-cancelled remainder remain visible as history; they are not new-token obligations.</p>
          <a className="docs-related" href="/lab">Open the Monero lab: records and early research</a>
          <p>Read the <a href="/roadmap">Monero roadmap</a> and the <a href="/transparency">donation commitment and public receipts</a>.</p>
        </Section>
        <Section index={10}>
          <div id="launch-coverage" className="docs-callout"><strong>Initial release coverage</strong><p>Grainpad tests its direct SOL and wXMR routes, permissions, spending limits, rewards and recovery. Independent-creator and graduated-pool paths have also executed against the real programs in a local Solana runtime. A Grainpad mainnet graduation and complete phone-wallet and external-terminal coverage remain unverified. Third-party discovery, throughput and complete historical indexing are not guaranteed. We publish observed results and use community reports to improve compatibility.</p></div>
          <p>The official GRAIN CA is published only on grainpad.fun and @GrainXMR after verification. Until then, no official CA is published. Display or trading support on Axiom, GMGN, Photon, Padre, Dexscreener and other external interfaces is not guaranteed.</p><p>Primary references: <a href="https://github.com/raydium-io/raydium-idl/blob/master/raydium_launchpad/raydium_launchpad.json" target="_blank" rel="noreferrer">LaunchLab IDL</a>, <a href="https://docs.raydium.io/products/launchlab/platform-config" target="_blank" rel="noreferrer">platform configuration</a>, <a href="https://docs.raydium.io/products/launchlab/instructions" target="_blank" rel="noreferrer">migration instructions</a>.</p><ul className="docs-links"><li><span>Website</span><a href={SITE.origin} target="_blank" rel="noreferrer">grainpad.fun</a></li><li><span>X / Twitter</span><a href={SITE.twitter} target="_blank" rel="noreferrer">x.com/GrainXMR</a></li><li><span>Public record</span><a href="/treasury">Treasury</a></li><li><span>Configuration</span><a href="/platform">Platform status</a></li><li><span>Research</span><a href="/lab">Monero lab</a></li></ul>
        </Section>
        <Section index={11}><WalletsFaq platform={platformState==="ready"?platform:null} token={token} tokenState={tokenState} solTradingEnabled={solTradingEnabled} solLookupConfigured={solLookupConfigured}/></Section>
      </article>
    </div>
    <SiteFooter/>
  </main>;
}
