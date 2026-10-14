"use client";
import {useEffect, useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {ROBINHOOD_CHAIN_MAINNET, ROBINHOOD_MAINNET_FACTORY_ADDRESS} from "@/lib/chain/robinhood-mainnet.ts";
import {address, bytes32, formatUnits18, parseUnits18, prepareWrap, prepareClaim, readFees, submitTransaction, transactionStatus, uintWord, type Rpc, type Transaction} from "@/lib/chain/robinhood-market.ts";
import {readMainnetMarket, prepareMainnetTrade, prepareMainnetGraduationRetry, assertMainnetTradeFresh, type MainnetMarket, type MainnetTradePlan} from "@/lib/chain/robinhood-mainnet-market.ts";
import {discoverRobinhoodMainnetWallets, watchRobinhoodMainnetWallet, type MainnetWalletSession, type MainnetWalletChoice} from "@/lib/chain/robinhood-mainnet-wallet.ts";
import type {MainnetLaunchRecord} from "@/lib/chain/robinhood-mainnet-registration.ts";
import type {StoredTrade} from "@/lib/chain/robinhood-history.ts";

type Balances = {platform: bigint; creator: bigint; trade: bigint; poolPlatformWeth: bigint; poolCreatorWeth: bigint; poolPlatformToken: bigint; poolCreatorToken: bigint};
type History = {trades: (StoredTrade & {venue?: string})[]; nextCursor: string | null};
const scalar = (value: unknown): bigint => {if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/i.test(value)) throw new Error("Invalid fee balance.");return BigInt(value);};
export function RobinhoodMainnetMarket({record}: {record: MainnetLaunchRecord}) {
  const enabled = !!ROBINHOOD_MAINNET_FACTORY_ADDRESS && record.factory === ROBINHOOD_MAINNET_FACTORY_ADDRESS.toLowerCase();
  const [wallets, setWallets] = useState<MainnetWalletChoice[]>([]); const [selection, setSelection] = useState(0);
  const [session, setSession] = useState<MainnetWalletSession | null>(null); const current = useRef<MainnetWalletSession | null>(null);
  const [market, setMarket] = useState<MainnetMarket | null>(null); const [balances, setBalances] = useState<Balances | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy"); const [amount, setAmount] = useState("0.001");
  const [plan, setPlan] = useState<MainnetTradePlan | null>(null); const [hash, setHash] = useState(""); const [status, setStatus] = useState("pending");
  const [recovery, setRecovery] = useState(""); const [busy, setBusy] = useState(""); const working = useRef(false);
  const [error, setError] = useState(""); const [history, setHistory] = useState<History | null>(null); const [historyError, setHistoryError] = useState("");
  const storageKey = (account: string) => "grainpad:4663:trade:" + record.tokenAddress + ":" + account;
  const walletRpc = (active: MainnetWalletSession): Rpc => (method, params) => active.provider.request({method, params});
  async function readHistory(cursor?: string) {
    const url = new URL("/api/robinhood/mainnet/history", window.location.origin); url.searchParams.set("token", record.tokenAddress);if (cursor) url.searchParams.set("before", cursor);
    const response = await fetch(url); if (!response.ok) throw new Error("History unavailable. Retry refresh.");
    const page = await response.json() as History;
    setHistory(previous => ({trades: [...new Map([...(cursor ? previous?.trades ?? [] : []), ...page.trades].map(event => [event.transactionHash + ":" + event.logIndex, event])).values()], nextCursor: page.nextCursor}));
    setHistoryError("");
  }
  useEffect(() => {
    if (!enabled) return; let active = true;
    void discoverRobinhoodMainnetWallets().then(next => {if (active) setWallets(next);});
    void Promise.resolve().then(() => readHistory()).catch(() => {if (active) setHistoryError("History unavailable. Retry refresh.");});
    return () => {active = false;};
    // History reads never request a wallet or signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, record.tokenAddress]);
  async function refresh(active = current.current) {
    if (!active) return;
    const rpc = walletRpc(active); const next = await readMainnetMarket(rpc, record); const fees = await readFees(rpc, next);
    const readPool = async (selector: string, asset: string) => next.locker ? scalar(await rpc("eth_call", [{to: next.locker, data: selector + uintWord(BigInt(address(asset)))}, "latest"])) : 0n;
    const values = await Promise.all([readPool("0x240b9586", next.quote), readPool("0x68eb4512", next.quote), readPool("0x240b9586", next.tokenAddress), readPool("0x68eb4512", next.tokenAddress)]);
    if (current.current?.account !== active.account || current.current.provider !== active.provider) return;
    setMarket(next); setBalances({...fees, poolPlatformWeth: values[0], poolCreatorWeth: values[1], poolPlatformToken: values[2], poolCreatorToken: values[3]});
  }
  useEffect(() => {
    if (!session) return;
    return watchRobinhoodMainnetWallet(session, next => {
      current.current = next; setSession(next); setPlan(null); setMarket(null); setBalances(null);
      setError("Wallet changed. Reconnect and review a fresh quote.");
    });
  }, [session]);
  async function run(label: string, job: () => Promise<void>) {
    if (working.current) return; working.current = true; setBusy(label); setError("");
    try {await job();} catch (cause) {setError(cause instanceof Error ? cause.message : "Please retry.");}
    finally {working.current = false; setBusy("");}
  }
  async function connect() {
    const choices = wallets.length ? wallets : await discoverRobinhoodMainnetWallets(); setWallets(choices);
    const choice = choices[selection]; if (!choice) throw new Error("Install or unlock an EVM browser wallet.");
    const next = await choice.connect(true); current.current = next; setSession(next); setPlan(null);
    try {const saved = localStorage.getItem(storageKey(next.account));if (saved && /^0x[0-9a-f]{64}$/.test(saved)) {setHash(saved);setRecovery(saved);setStatus("pending");}} catch { /* Manual hash recovery remains available. */ }
    await refresh(next);
  }
  async function send(tx: Transaction) {
    const response = await fetch("/api/robinhood/mainnet/provenance?token=" + encodeURIComponent(record.tokenAddress),{cache:"no-store"});
    const admission = await response.json() as {admitted?:boolean;error?:string;reason?:string};
    if (!response.ok || admission.admitted !== true) throw new Error(admission.error ?? admission.reason ?? "Monero registration is not currently verified.");
    const active = current.current; if (!active || active.account !== tx.from) throw new Error("Reconnect and review again.");
    const sent = await submitTransaction(active.provider, tx); setHash(sent);setStatus("pending");setPlan(null);
    try {localStorage.setItem(storageKey(active.account), sent);} catch { /* Submitted hash remains visible. */ }
  }
  async function review() {
    const active = current.current; if (!active) throw new Error("Connect your mainnet wallet.");
    const next = await readMainnetMarket(walletRpc(active), record);
    const proposal = await prepareMainnetTrade(walletRpc(active), next, active.account, side, parseUnits18(amount), 100);
    if (current.current?.account !== active.account || current.current.provider !== active.provider) throw new Error("Wallet changed. Review again.");
    setMarket(next);setPlan(proposal);
  }
  async function execute() {
    if (!plan) return;
    try {assertMainnetTradeFresh(plan);} catch (cause) {setPlan(null);throw cause;}
    await send(plan.approval ?? plan.transaction);
  }
  async function check(transactionHash = hash) {
    const active = current.current;if (!active) throw new Error("Connect your mainnet wallet.");
    const verified = bytes32(transactionHash);setHash(verified);
    setStatus(await transactionStatus(walletRpc(active), verified, "robinhood:mainnet"));
    setPlan(null);await refresh(active);try {await readHistory();} catch {setHistoryError("History unavailable. Retry refresh.");}
  }
  const feePayee = !!market && !!session && (session.account === market.creator || session.account === market.platform);
  async function poolClaim(asset: string, creatorBucket: boolean) {
    const active = current.current;if (!active || !market?.locker) throw new Error("No locked pool position.");
    await send({from: active.account, to: market.locker, data: "0x92fd2daf" + uintWord(BigInt(address(asset))) + uintWord(creatorBucket ? 1n : 0n), value: "0x0", chainId: "0x1237"});
  }
  return <section className="panel form-panel"><h2>market</h2>
    {!enabled ? <p role="status">Mainnet launching is not yet available.</p> : <>
      <label>Wallet<select value={selection} disabled={!!busy} onChange={e => {setSelection(Number(e.target.value));current.current = null;setSession(null);setPlan(null);setMarket(null);setBalances(null);}}>{wallets.map((choice,index) => <option key={index} value={index}>{choice.name}</option>)}</select></label>
      <Button variant="outline" disabled={!!busy} onClick={() => void run("Connecting wallet", connect)}>{session ? "Change wallet / refresh" : "Connect mainnet wallet"}</Button>
      {session && <p className="address-line">{session.account}</p>}
      {market && <><p>{market.graduated ? "Trading on Uniswap · permanently locked launch liquidity." : market.graduationPending ? "DEX migration is pending. The curve still holds reserves; selling and migration retry remain available." : "Trading on the WETH curve."}</p>
        <dl><div><dt>Curve WETH reserve</dt><dd>{formatUnits18(market.realQuote)}</dd></div><div><dt>Curve sale inventory</dt><dd>{formatUnits18(market.inventory)}</dd></div></dl>
        <p>{market.graduated ? "The pool charges 1%; realized net LP fees are split 35% grainpad / 65% creator. Protocol deductions and other liquidity can reduce earnings." : "1% total fee: 0.35% grainpad / 0.65% creator."}</p>
        {market.pool && <a href={ROBINHOOD_CHAIN_MAINNET.blockExplorerUrl + "/address/" + market.pool} target="_blank" rel="noreferrer">View pool</a>}
        {market.locker && <p><a href={ROBINHOOD_CHAIN_MAINNET.blockExplorerUrl + "/address/" + market.locker} target="_blank" rel="noreferrer">View liquidity lock</a> · {formatUnits18(market.lockedTokens)} tokens remain locked in the curve.</p>}
        <label>Direction<select value={side} disabled={!!busy} onChange={e => {setSide(e.target.value as "buy" | "sell");setPlan(null);}}><option value="buy">Buy with WETH</option><option value="sell">Sell for WETH</option></select></label>
        <label>Amount ({side === "buy" ? "WETH" : record.symbol})<Input value={amount} disabled={!!busy} onChange={e => {setAmount(e.target.value);setPlan(null);}}/></label>
        {!market.graduated && side === "buy" && market.maxBuy > 0n && <Button variant="outline" disabled={!!busy} onClick={() => {setAmount(formatUnits18(market.maxBuy));setPlan(null);}}>Fill remaining curve</Button>}
        {side === "buy" && <Button variant="outline" disabled={!!busy} onClick={() => void run("Review wrap in wallet", () => send(prepareWrap(session!.account, parseUnits18(amount), "robinhood:mainnet")))}>Wrap entered ETH into WETH</Button>}
        <p>Keep ETH for gas. Wrapping, approval and trading are separate transactions.</p>
        <Button disabled={!!busy} onClick={() => void run("Preparing quote", review)}>Review quote (1% slippage)</Button>
        {plan && <div className="receipt"><p>Expected: {formatUnits18(plan.output)}. Minimum: {formatUnits18(plan.minimum)} {side === "buy" ? record.symbol : "WETH"}.</p>
          <p>{plan.venue === "curve" ? "WETH fees: grainpad " + formatUnits18(plan.fees.platform) + ", creator " + formatUnits18(plan.fees.creator) : "The output already includes the pool fee. No extra frontend fee is added."}</p>
          <p>{plan.approval ? "Approve only this amount, then request a fresh quote after confirmation." : "Quote expires after one minute; the transaction also enforces its deadline."}</p>
          <Button disabled={!!busy} onClick={() => void run("Review in wallet", execute)}>{plan.approval ? "Approve exact amount" : "Submit reviewed trade"}</Button></div>}
        {market.graduationPending && <Button variant="outline" disabled={!!busy} onClick={() => void run("Retrying DEX migration", () => send(prepareMainnetGraduationRetry(market, session!.account)))}>Retry DEX migration</Button>}
        {balances && session && <>
          {session.account === market.creator && <Button variant="outline" disabled={!!busy || balances.creator === 0n} onClick={() => void run("Claiming creator curve fees", async () => send(await prepareClaim(walletRpc(session), market, session.account, 1)))}>Claim creator curve fees ({formatUnits18(balances.creator)} WETH)</Button>}
          {session.account === market.platform && <Button variant="outline" disabled={!!busy || balances.platform === 0n} onClick={() => void run("Claiming platform curve fees", async () => send(await prepareClaim(walletRpc(session), market, session.account, 0)))}>Claim grainpad curve fees ({formatUnits18(balances.platform)} WETH)</Button>}
          {market.graduated && market.locker && feePayee && <div className="receipt"><h3>Locked pool fees</h3>
            <Button variant="outline" disabled={!!busy} onClick={() => void run("Collecting new pool fees", () => send({from: session.account, to: market.locker!, data: "0xe5225381", value: "0x0", chainId: "0x1237"}))}>Collect new pool fees</Button>
            {([true,false] as const).filter(creatorBucket => session.account === (creatorBucket ? market.creator : market.platform)).map(creatorBucket => <div key={String(creatorBucket)}>
              <p>{creatorBucket ? "Creator" : "Grainpad"}: {formatUnits18(creatorBucket ? balances.poolCreatorWeth : balances.poolPlatformWeth)} WETH and {formatUnits18(creatorBucket ? balances.poolCreatorToken : balances.poolPlatformToken)} {record.symbol}. Token fees are unconverted assets.</p>
              <Button variant="outline" disabled={!!busy || (creatorBucket ? balances.poolCreatorWeth : balances.poolPlatformWeth) === 0n} onClick={() => void run("Claiming pool WETH", () => poolClaim(market.quote, creatorBucket))}>Claim WETH</Button>
              <Button variant="outline" disabled={!!busy || (creatorBucket ? balances.poolCreatorToken : balances.poolPlatformToken) === 0n} onClick={() => void run("Claiming pool tokens", () => poolClaim(market.tokenAddress, creatorBucket))}>Claim token fees</Button>
            </div>)}
          </div>}
        </>}
      </>}
      {hash && <div className="receipt"><p role="status">Transaction: {status === "success" ? "Mined successfully. Finalized history can arrive later." : status}</p><a href={ROBINHOOD_CHAIN_MAINNET.blockExplorerUrl + "/tx/" + hash} target="_blank" rel="noreferrer">View transaction</a><Button variant="outline" disabled={!!busy || !session} onClick={() => void run("Checking transaction", () => check())}>Check transaction and refresh</Button></div>}
      {session && <><label>Recover a transaction<Input value={recovery} disabled={!!busy} onChange={e => setRecovery(e.target.value)} placeholder="0x transaction hash"/></label><Button variant="outline" disabled={!!busy || !recovery} onClick={() => void run("Checking earlier transaction", () => check(recovery))}>Recover transaction</Button></>}
      <h3>Trade history</h3><p>Finalized curve trades and pool swaps. Pool recipients can be routers or aggregators rather than the original trader.</p>
      {history && <><p>{history.nextCursor ? "Load earlier history to continue back to creation." : "History checked back to creation."}</p><ul>{history.trades.map(event => <li key={event.transactionHash + ":" + event.logIndex}><a href={ROBINHOOD_CHAIN_MAINNET.blockExplorerUrl + "/tx/" + event.transactionHash} target="_blank" rel="noreferrer">{event.venue ?? "curve"} · {event.side}: {formatUnits18(BigInt(event.amountIn))} → {formatUnits18(BigInt(event.amountOut))}</a></li>)}</ul>{history.nextCursor && <Button variant="outline" disabled={!!busy} onClick={() => void run("Loading earlier history", () => readHistory(history.nextCursor!))}>Load earlier history</Button>}</>}
      <Button variant="outline" disabled={!!busy} onClick={() => void run("Refreshing history", readHistory)}>Refresh history</Button>
      {historyError && <p role="status">{historyError}</p>}
    </>}
    {busy && <p role="status">{busy}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
