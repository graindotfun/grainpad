"use client";
import {previewContinuousCreatorBuy} from '@/lib/chain/v3-launch-preview.ts';
/* eslint-disable @next/next/no-img-element -- Creator-selected data URLs are previewed without a proxy. */
/**
 * One-approval Robinhood launch (candidate, closed until the owner-verified V2 factory is pinned).
 * Separate from the existing two-signature screen: it shares no state with it and imports no stylesheet of its own,
 * so the button/CSS work on that screen is unaffected. The only wallet prompt it can raise is the single launch transaction.
 */
import {useCallback, useEffect, useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {SiteHeader} from "@/components/site-header";
import {LaunchNetworkChip} from "@/components/launch-network-chip";
import {LaunchTokenPreviewCard} from "@/components/launch-token-preview-card";
import {SiteFooter} from "@/components/site-footer";
import "@/app/launch-modes.css";
import "@/app/robinhood-launch.css";
import {ROBINHOOD_CHAIN_MAINNET} from "@/lib/chain/robinhood-mainnet.ts";
import {robinhoodMainnetV2Profile} from "@/lib/chain/robinhood-mainnet-v2.ts";
import {newRobinhoodMainnetLaunchId} from "@/lib/chain/robinhood-mainnet-create.ts";
import {discoverRobinhoodMainnetWallets, watchRobinhoodMainnetWallet, type MainnetWalletSession, type MainnetWalletChoice} from "@/lib/chain/robinhood-mainnet-wallet.ts";
import {planOneApprovalLaunch, previewCreatorBuy, type LaunchPlan} from "@/lib/chain/evm-one-approval-launch.ts";
import {submitOneApprovalLaunch, probeLaunchId} from "@/lib/chain/one-approval-launch-client.ts";
import {createLaunchJournal, recoverCreationTransaction, recentCreatorLaunches, proveNothingSent, verifyCreationTransaction, assertChain, browserJournalLock, type KeyValueStore, type V2JournalEntry} from "@/lib/chain/one-approval-launch-journal.ts";
import {LAUNCH_STAGES, type LaunchStage} from "@/lib/chain/launch-progress.ts";
import {LAUNCH_CREATED_TOPIC} from "@/lib/chain/robinhood-create.ts";
import {saveMainnetDraft, readMainnetDraft} from "@/lib/chain/robinhood-mainnet-draft.ts";

const STAGE_LABEL: Record<LaunchStage, string> = {
  submitted: "Submitted", created: "Created on-chain", metadata_verified: "Metadata verified",
  awaiting_monero: "Awaiting Monero confirmations", trading_available: "Trading available",
};
type ServerStatus = {token: string | null; progress: {stage: LaunchStage | null; status: string; detail: string; mayCreateAgain: boolean}; facts: {moneroConfirmations: number | null; receipt?: string; transactionHash?: string | null}; authorizationExpired: boolean; note: string | null};

const browserStores = (): KeyValueStore[] => [
  {async get(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }},
   async set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
   async remove(key) { localStorage.removeItem(key); }},
  {get: key => readMainnetDraft(key), set: (key, value) => saveMainnetDraft(key, value), remove: key => saveMainnetDraft(key, {})},
];

/** Decimal ETH text to wei without floating point. */
function parseEth(text: string): bigint {
  const t = text.trim();
  if (t === "") return 0n;
  if (!/^\d{0,9}(\.\d{0,18})?$/.test(t) || t === ".") throw new Error("Enter an ETH amount like 0.05.");
  const [whole, frac = ""] = t.split(".");
  return BigInt(whole || "0") * 10n ** 18n + BigInt(frac.padEnd(18, "0"));
}
const fmt = (wei: bigint, digits = 6) => {
  const s = wei.toString().padStart(19, "0"), whole = s.slice(0, -18), frac = s.slice(-18).slice(0, digits).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
};
const nowSeconds = () => Math.floor(Date.now() / 1000);
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  return Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
}

export function RobinhoodMainnetLaunchV2() {
  const profile = robinhoodMainnetV2Profile();
  const ready = !!profile;
  const [wallets, setWallets] = useState<MainnetWalletChoice[]>([]);
  const [selected, setSelected] = useState(0);
  const [session, setSession] = useState<MainnetWalletSession | null>(null);
  const sessionRef = useRef<MainnetWalletSession | null>(null);
  const [name, setName] = useState(""); const [symbol, setSymbol] = useState(""); const [description, setDescription] = useState("");
  const [website, setWebsite] = useState(""); const [twitter, setTwitter] = useState(""); const [telegram, setTelegram] = useState("");
  const [picture, setPicture] = useState(""); const [pictureType, setPictureType] = useState("");
  const [buyText, setBuyText] = useState(""); const [slippage, setSlippage] = useState(100);
  const [entry, setEntry] = useState<V2JournalEntry | null>(null);
  const [conflict, setConflict] = useState(false);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  const working = useRef(false);
  const finished = useRef(false);
  const [recent, setRecent] = useState<Array<{launchId: string; transactionHash: string}>>([]);
  const [another, setAnother] = useState(false);
  const [manualHash, setManualHash] = useState("");
  const channel = useRef<BroadcastChannel | null>(null);
  /** Take the journal as truth. A different launch or hash (below) drops every progress fact held for the previous one. */
  const applyJournal = useCallback((read: {entry: V2JournalEntry | null; conflict: boolean}) => { setEntry(read.entry); setConflict(read.conflict); }, []);

  // Reset during render (not in an effect) when the wallet account, or the journal's launch or transaction, changes: progress,
  // typed hashes and errors belong to what they were collected for and must never be shown against anything else.
  const account = session?.account ?? null;
  const [seenAccount, setSeenAccount] = useState(account);
  if (seenAccount !== account) {
    setSeenAccount(account);
    setEntry(null); setConflict(false); setStatus(null); setRecent([]); setManualHash(""); setError("");
  }
  const progressKey = `${entry?.launchId ?? ""}|${entry?.transactionHash ?? ""}`;
  const [seenProgressKey, setSeenProgressKey] = useState(progressKey);
  if (seenProgressKey !== progressKey) { setSeenProgressKey(progressKey); setStatus(null); }

  useEffect(() => {
    if (!ready) return;
    let active = true;
    void discoverRobinhoodMainnetWallets().then(next => { if (active) setWallets(next); });
    return () => { active = false; };
  }, [ready]);

  useEffect(() => {
    if (!session) return;
    return watchRobinhoodMainnetWallet(session, next => { sessionRef.current = next; setSession(next); if (!next) setError("Wallet disconnected. Reconnect to continue; any submitted launch is preserved."); });
  }, [session]);

  const journalFor = useCallback((account: string, provider: MainnetWalletSession["provider"]) => createLaunchJournal(browserStores(), account, {
    lock: browserJournalLock,
    startBlock: async () => { const block = await provider.request({method: "eth_blockNumber"}); return typeof block === "string" ? BigInt(block).toString() : null; },
  }), []);

  /** Advance on the server by transaction hash. Idempotent; the server also advances launches on its own schedule. */
  const poll = useCallback(async (transactionHash: string, launchId: string) => {
    const response = await fetch("/api/robinhood/mainnet/v2/launch", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({transactionHash, launchId})});
    const payload = await response.json() as ServerStatus & {error?: string};
    if (!response.ok) throw new Error(payload?.error ?? "Status unavailable. Retrying.");
    return payload as ServerStatus;
  }, []);

  const resolveHash = useCallback(async (active: MainnetWalletSession, current: V2JournalEntry): Promise<string | null> => {
    if (current.transactionHash) return current.transactionHash;
    if (!profile) return null;
    // Unknown outcome: the factory's launch-id mapping answers whether it was created, even without a hash.
    const rpc = (method: string, params: unknown[]) => active.provider.request({method, params});
    await assertChain(rpc, BigInt(profile.chainId));
    if (!(await probeLaunchId(rpc, profile.factory, current.launchId))) return null;
    const hash = await recoverCreationTransaction(rpc, profile.factory, current.launchId, LAUNCH_CREATED_TOPIC, current.startBlock);
    if (!hash) return null;
    const verdict = await verifyCreationTransaction(rpc, {hash, creator: active.account, factory: profile.factory, launchId: current.launchId, chainId: BigInt(profile.chainId), dataHash: current.dataHash});
    if (!verdict.ok) throw new Error(verdict.reason);
    const journal = journalFor(active.account, active.provider);
    await journal.markSent({launchId: current.launchId, transactionHash: hash});
    applyJournal(await journal.read());
    return hash;
  }, [profile, journalFor, applyJournal]);

  // Resume after refresh, tab closure or timeout: the journal, not component state, is the source of truth.
  useEffect(() => {
    if (!session || !ready) return;
    let active = true;
    void (async () => {
      const read = await journalFor(session.account, session.provider).read();
      if (!active) return;
      applyJournal(read);
    })();
    return () => { active = false; };
  }, [session, ready, journalFor, applyJournal]);

  // Other tabs of this wallet learn about a started, finished or cleared launch immediately.
  useEffect(() => {
    if (!session || typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel("grainpad-rh-v2:" + session.account);
    channel.current = bc;
    bc.onmessage = () => { void journalFor(session.account, session.provider).read().then(applyJournal); };
    return () => { bc.close(); channel.current = null; };
  }, [session, journalFor, applyJournal]);

  useEffect(() => {
    if (!session || !entry || conflict) return;
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    finished.current = false;
    const tick = async () => {
      try {
        const hash = await resolveHash(session, entry);
        if (hash && active) { const next = await poll(hash, entry.launchId); if (active) { finished.current = next.progress?.stage === "trading_available"; setStatus(next); } }
        else if (active) setStatus({token: null, facts: {moneroConfirmations: null}, authorizationExpired: false, note: null, progress: {stage: "submitted", status: "working", detail: "Wallet request outcome unknown. Checking the chain for this launch before anything can be repeated.", mayCreateAgain: false}});
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Status unavailable. Retrying."); }
      if (active && !finished.current) timer = setTimeout(() => void tick(), 6000);
    };
    void tick();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [session, entry, conflict, resolveHash, poll]);

  async function run(label: string, job: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(label); setError("");
    try { await job(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Please retry."); }
    finally { working.current = false; setBusy(""); }
  }

  async function connect() {
    const choices = wallets.length ? wallets : await discoverRobinhoodMainnetWallets(); setWallets(choices);
    const choice = choices[selected]; if (!choice) throw new Error("Install or unlock an EVM browser wallet.");
    const next = await choice.connect(true); sessionRef.current = next; setSession(next);
  }

  function pickImage(file?: File) {
    if (!file || entry) return;
    void run("Reading image", async () => {
      if (file.size > 2_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPG or WebP below 2 MB.");
      const {validateImage} = await import("@/lib/image-validation.mjs");
      validateImage(new Uint8Array(await file.arrayBuffer()), file.type);
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Image could not be read.")); reader.readAsDataURL(file); });
      setPicture(data); setPictureType(file.type);
    });
  }

  let buy: ReturnType<typeof previewCreatorBuy> | null = null; let buyError = "";
  try { const wei = parseEth(buyText); if (wei > 0n) buy = profile?.marketModel ? previewContinuousCreatorBuy(wei, slippage) : previewCreatorBuy(wei, slippage); } catch (cause) { buyError = cause instanceof Error ? cause.message : ""; }

  /** Prepare (image and metadata saved and hash-checked), then exactly one wallet request. */
  async function launch() {
    if (!profile || !session || entry) return;
    const wallet = session;
    const imageBase64 = picture ? picture.slice(picture.indexOf(",") + 1) : null;
    const imageSha256 = imageBase64 ? await sha256Hex(Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0))) : null;
    // A browser journal cannot see a launch made from another browser or before storage was cleared: ask the chain.
    if (!another) {
      const found = await recentCreatorLaunches((method, params) => wallet.provider.request({method, params}), profile.factory, wallet.account, LAUNCH_CREATED_TOPIC);
      if (found.length) { setRecent(found); throw new Error("This wallet created a launch recently. Recover it below, or tick \"launch another token\" to continue."); }
    }
    const launchId = newRobinhoodMainnetLaunchId(wallet.account);
    const {plan} = planOneApprovalLaunch(profile, {creator: wallet.account, launchId, buyWei: buy?.quoteIn ?? 0n, slippageBps: slippage, nowSeconds: nowSeconds(),
      metadata: {name, symbol, description, imageSha256, website, twitter, telegram}});
    // Step 0, before any wallet prompt: save the image and metadata, then require the server to agree on the exact hash.
    const response = await fetch("/api/robinhood/mainnet/prepare", {method: "POST", headers: {"content-type": "application/json"},
      body: JSON.stringify({launchId, name, symbol, description, website, twitter, telegram, ...(imageBase64 ? {imageBase64, imageType: pictureType} : {})})});
    const prepared = await response.json() as {error?: string; metadataHash?: string; metadataURI?: string};
    if (!response.ok) throw new Error(prepared?.error ?? "Metadata could not be saved. Nothing was sent to your wallet.");
    if (prepared.metadataHash !== plan.metadataHash || prepared.metadataURI !== plan.metadataURI) throw new Error("Saved metadata differs from this review. Nothing was sent to your wallet.");
    const journal = journalFor(wallet.account, wallet.provider);
    setStatus({token: null, facts: {moneroConfirmations: null}, authorizationExpired: false, note: null, progress: {stage: "submitted", status: "working", detail: "Approve the single request in your wallet.", mayCreateAgain: false}});
    try { await submitOneApprovalLaunch(wallet.provider, plan as LaunchPlan, wallet.account, journal); }
    finally {
      // Whatever happened (success, refusal, or a lost response), the journal is the truth: show and share it at once.
      const read = await journal.read().catch(() => null);
      if (read) applyJournal(read);
      channel.current?.postMessage("journal");
    }
  }

  /** Release a hash-less entry only on proof that its signed deadline has finalized without a creation. */
  async function clearUnsent() {
    if (!session || !entry || entry.transactionHash || !profile) return;
    const rpc = (method: string, params: unknown[]) => session.provider.request({method, params});
    if (conflict) throw new Error("Conflicting launch records are preserved. Nothing was cleared.");
    const proof = await proveNothingSent(rpc, entry, profile.factory, LAUNCH_CREATED_TOPIC, BigInt(profile.chainId));
    if (!proof.safe) throw new Error(proof.reason);
    // The wallet may have been switched to another account or network while the proof was running: re-check before deleting.
    await assertChain(rpc, BigInt(profile.chainId));
    if (sessionRef.current?.account !== session.account || session.account !== entry.creator) throw new Error("The wallet account changed during the check. Nothing was cleared.");
    const cleared = await createLaunchJournal(browserStores(), session.account, {lock: browserJournalLock}).clear({launchId: entry.launchId, transactionHash: null});
    if (!cleared) throw new Error("This launch changed in another tab. Nothing was cleared.");
    finished.current = false; setEntry(null); setStatus(null); channel.current?.postMessage("journal");
  }

  /** The user pastes the hash from their wallet activity. It is verified (sender, factory, calldata, launch id) before it is recorded. */
  async function recoverByHash() {
    if (!session || !entry || entry.transactionHash || !profile) return;
    const hash = manualHash.trim().toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(hash)) throw new Error("Enter the 66-character transaction hash from your wallet.");
    const rpc = (method: string, params: unknown[]) => session.provider.request({method, params});
    const verdict = await verifyCreationTransaction(rpc, {hash, creator: session.account, factory: profile.factory, launchId: entry.launchId, chainId: BigInt(profile.chainId), dataHash: entry.dataHash});
    if (!verdict.ok) throw new Error(verdict.reason);
    const verified = await poll(hash, entry.launchId);     // the server also binds it to THIS launch id
    const journal = journalFor(session.account, session.provider);
    await journal.markSent({launchId: entry.launchId, transactionHash: hash});
    applyJournal(await journal.read()); setStatus(verified); setManualHash("");
    channel.current?.postMessage("journal");
  }

  /** A finalized revert, bound to this journal's transaction and launch id by the server, proves nothing was created. */
  async function clearReverted() {
    if (conflict) throw new Error("Conflicting launch records are preserved. Nothing was cleared.");
    if (!session || !entry || !status || status.facts.receipt !== "reverted" || !status.progress.mayCreateAgain || !entry.transactionHash || status.facts.transactionHash !== entry.transactionHash) return;
    if (sessionRef.current?.account !== session.account || session.account !== entry.creator) throw new Error("The wallet account changed. Nothing was cleared.");
    const cleared = await createLaunchJournal(browserStores(), session.account, {lock: browserJournalLock}).clear({launchId: entry.launchId, transactionHash: entry.transactionHash});
    if (!cleared) throw new Error("This launch changed in another tab. Nothing was cleared.");
    finished.current = false; setEntry(null); setStatus(null); channel.current?.postMessage("journal");
  }

  /** Adopt a launch found on-chain: journal it so this tab recovers it instead of creating another. */
  async function adopt(found: {launchId: string; transactionHash: string}) {
    if (!session || !profile) return;
    const rpc = (method: string, params: unknown[]) => session.provider.request({method, params});
    const verdict = await verifyCreationTransaction(rpc, {hash: found.transactionHash, creator: session.account, factory: profile.factory, launchId: found.launchId, chainId: BigInt(profile.chainId)});
    if (!verdict.ok) throw new Error(verdict.reason);
    const journal = journalFor(session.account, session.provider);
    await journal.markStarted({launchId: found.launchId, creator: session.account, digest: "0x" + "00".repeat(32)});
    await journal.markSent({launchId: found.launchId, transactionHash: found.transactionHash});
    applyJournal(await journal.read()); setRecent([]);
    channel.current?.postMessage("journal");
  }

  /** Dismiss a completed launch: only when it is trading and this tab's journal still holds that exact launch and transaction. */
  async function finish() {
    if (conflict) throw new Error("Conflicting launch records are preserved. Nothing was cleared.");
    if (!session || !entry || !entry.transactionHash || status?.progress.stage !== "trading_available" || status.facts.transactionHash !== entry.transactionHash) return;
    const cleared = await createLaunchJournal(browserStores(), session.account, {lock: browserJournalLock}).clear({launchId: entry.launchId, transactionHash: entry.transactionHash});
    if (!cleared) throw new Error("This launch changed in another tab. Nothing was cleared.");
    finished.current = false;
    setEntry(null); setStatus(null); setName(""); setSymbol(""); setDescription(""); setWebsite(""); setTwitter(""); setTelegram(""); setPicture(""); setBuyText("");
    channel.current?.postMessage("journal");
  }

  const locked = !!busy || !!entry;
  const stage = status?.progress.stage ?? null;
  const done = stage === "trading_available";
  return <main className="gx gx-create rh-launch-flow"><SiteHeader showWallet={false}/>
    <div className="gx-wrap gx-create-wrap" id="main-content">
      <div className="gx-create-head"><div><LaunchNetworkChip networkId="robinhood:mainnet" disabled={!!busy} submitted={!!entry} identity={() => ({name, symbol, description, picture, pictureName: "", twitter, telegram, website})} onError={setError}/><p className="gx-label">regular launch · Robinhood · one approval</p><h1 className="gx-display">launch a token<span className="gx-dot">.</span></h1></div>
        <p className="gx-mute">One wallet approval creates the token, binds its image and links, authorizes its Monero launch record and makes your optional first purchase. The rest continues automatically.</p></div>
      <div className="launch-grid"><section className="panel form-panel launch-flow">
        {!ready && <p role="status">One-approval launching is not yet available.</p>}
        <label className="gx-field">name<Input value={name} disabled={locked || !ready} maxLength={32} placeholder="give your token a name" onChange={e => setName(e.target.value)}/></label>
        <label className="gx-field">ticker<Input value={symbol} disabled={locked || !ready} maxLength={10} placeholder="E.G. SEED" onChange={e => setSymbol(e.target.value.toUpperCase())}/></label>
        <label className="gx-field">what is it?<Textarea value={description} disabled={locked || !ready} maxLength={1000} placeholder="what is this token for?" onChange={e => setDescription(e.target.value)}/></label>
        <label className="upload-label"><span>{picture ? "Token image selected" : "Add token image"}<small>PNG, JPG or WebP · up to 2 MB.</small></span>
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={locked || !ready} onChange={e => { pickImage(e.target.files?.[0]); e.target.value = ""; }}/></label>
        {picture && <div className="launch-upload-selected"><img src={picture} alt="Selected token image"/><Button variant="outline" disabled={locked} onClick={() => { setPicture(""); setPictureType(""); }}>Remove</Button></div>}
        <details className="launch-fold"><summary>Project links<span className="launch-fold-meta">Optional</span></summary>
          <label>Website<Input type="url" value={website} disabled={locked || !ready} maxLength={300} placeholder="https://your-project.com" onChange={e => setWebsite(e.target.value)}/></label>
          <label>X / Twitter<Input type="url" value={twitter} disabled={locked || !ready} maxLength={300} placeholder="https://x.com/your_project" onChange={e => setTwitter(e.target.value)}/></label>
          <label>Telegram<Input type="url" value={telegram} disabled={locked || !ready} maxLength={300} placeholder="https://t.me/your_project" onChange={e => setTelegram(e.target.value)}/></label>
        </details>
        <label className="gx-field">first purchase (optional, ETH)<Input inputMode="decimal" value={buyText} disabled={locked || !ready} placeholder="0" onChange={e => setBuyText(e.target.value)}/></label>
        <label>Slippage<select value={slippage} disabled={locked || !ready} onChange={e => setSlippage(Number(e.target.value))}>{[50, 100, 300, 500].map(bps => <option key={bps} value={bps}>{bps / 100}%</option>)}</select></label>
        {buyError && <p role="alert">{buyError}</p>}
        <div className="transaction-review" aria-label="Transaction review"><p className="launch-review-summary">{name || "Your token"} · ${symbol || "—"}</p>
          <dl><div><dt>Network</dt><dd>Robinhood mainnet</dd></div>
            <div><dt>Approvals</dt><dd>1 wallet transaction</dd></div>
            <div><dt>Includes</dt><dd>token creation · image and links · Monero registration authorization{buy ? " · first purchase" : ""}</dd></div>
            {buy ? <>
              <div><dt>You send</dt><dd>{fmt(buy.quoteIn)} ETH + network gas</dd></div>
              <div><dt>Fees (pool)</dt><dd>{fmt(buy.totalFee, 8)} ETH (1%). Realized LP fees: 35% grainpad, 65% creator.</dd></div>
              <div><dt>{profile?.marketModel ? "Into the pool" : "Into the curve"}</dt><dd>{fmt(buy.net, 8)} ETH</dd></div>
              <div><dt>Expected tokens</dt><dd>{fmt(buy.tokensOut, 2)}</dd></div>
              <div><dt>Minimum tokens ({slippage / 100}% slippage)</dt><dd>{fmt(buy.minTokensOut, 2)}</dd></div>
              <div><dt>If it fails</dt><dd>Everything reverts together. Nothing is created.</dd></div></>
              : <div><dt>First purchase</dt><dd>None</dd></div>}
            <div><dt>Grainpad listing</dt><dd>After Monero registration has ten confirmations</dd></div>
            {profile?.marketModel && <div><dt>Market</dt><dd>Uniswap V3 from launch. 1 billion tokens; permanently locked liquidity; no graduation. Buys pay WETH fees; sells pay token fees. Other LPs and protocol deductions can reduce earnings.</dd></div>}</dl></div>
        <label>Wallet<select value={selected} disabled={locked || !ready} onChange={e => { setSelected(Number(e.target.value)); sessionRef.current = null; setSession(null); }}>{wallets.map((wallet, index) => <option key={index} value={index}>{wallet.name}</option>)}</select></label>
        <Button variant="outline" disabled={!ready || !!busy} onClick={() => void run("Connecting", connect)}>{session ? "Change wallet / recover" : "Connect wallet"}</Button>
        {session && <p className="address-line">{session.account}</p>}
        {!entry && recent.length > 0 && <section className="receipt" aria-label="Recent launches from this wallet"><p role="status">Found on-chain:</p>
          {recent.map(found => <p key={found.transactionHash}><span className="address-line">{found.transactionHash}</span> <Button variant="outline" disabled={!!busy} onClick={() => void run("Recovering", () => adopt(found))}>Recover this launch</Button></p>)}
          <label><input type="checkbox" checked={another} onChange={e => setAnother(e.target.checked)}/> launch another token anyway</label></section>}
        {!entry && <Button className="primary-action" disabled={!ready || !session || locked || !name || !symbol || !!buyError} onClick={() => void run("Saving details, then review in your wallet", launch)}>Launch</Button>}
        {conflict && <p role="alert">Conflicting launch records are preserved. Verify each original transaction before doing anything else.</p>}
        {entry && <section className="receipt" aria-label="Launch progress" aria-live="polite">
          <ol>{LAUNCH_STAGES.map(key => { const index = LAUNCH_STAGES.indexOf(key), at = stage ? LAUNCH_STAGES.indexOf(stage) : -1;
            const isDone = index < at || done, isNow = key === stage && !done;
            return <li key={key} aria-current={key === stage ? "step" : undefined} data-done={isDone || undefined} data-state={isDone ? "done" : isNow ? "current" : "pending"}><span aria-hidden="true">{isDone ? "✓ " : isNow ? "● " : "○ "}</span>{STAGE_LABEL[key]}{key === "awaiting_monero" && stage === "awaiting_monero" && status?.facts.moneroConfirmations != null ? ` (${Math.min(status.facts.moneroConfirmations, 10)}/10)` : ""}</li>; })}</ol>
          <p role="status">{status?.progress.detail ?? "Checking the chain."}</p>
          {status?.note && <p role="status">{status.note}</p>}
          {entry.transactionHash && <p><a href={ROBINHOOD_CHAIN_MAINNET.blockExplorerUrl + "/tx/" + entry.transactionHash} target="_blank" rel="noreferrer">View transaction</a></p>}
          <p className="small muted">You can close this page. Registration and indexing continue automatically, and this screen resumes from your saved record. Do not create this launch again.</p>
          {!entry.transactionHash && !conflict && <div>
            <Button variant="outline" disabled={!!busy} onClick={() => void run("Checking the chain", clearUnsent)}>Nothing was sent: verify and clear</Button>
            <label>Transaction hash from your wallet activity<Input value={manualHash} placeholder="0x…" onChange={e => setManualHash(e.target.value)}/></label>
            <Button variant="outline" disabled={!!busy || !manualHash} onClick={() => void run("Checking that transaction", recoverByHash)}>Recover by transaction hash</Button></div>}
          {!conflict && status?.facts.receipt === "reverted" && status.progress.mayCreateAgain && entry.transactionHash && status.facts.transactionHash === entry.transactionHash &&
            <Button variant="outline" disabled={!!busy} onClick={() => void run("Clearing", clearReverted)}>This launch reverted on-chain and nothing was created: clear and start again</Button>}
          {done && status?.token && <p><a href={"/network/robinhood/mainnet/token/" + status.token}>Open token market</a></p>}
          {done && !conflict && <Button variant="outline" disabled={!!busy} onClick={() => void run("Preparing a new launch", finish)}>Start a new launch</Button>}
        </section>}
        {busy && <p role="status">{busy}</p>}{error && <p className="feedback error" role="alert">{error}</p>}
      </section>
      <aside className="preview-panel gx-preview gx-onor" aria-label="Launch preview"><p className="gx-label is-ink">live preview · your token in the making</p>
        <LaunchTokenPreviewCard mode={2} networkId="robinhood:mainnet" stageLabel="one approval" name={name} symbol={symbol} description={description} image={picture}/></aside></div>
    </div><SiteFooter/>
  </main>;
}
