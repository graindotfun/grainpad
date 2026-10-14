"use client";

import {useEffect, useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {connectRobinhoodTestnet, discoverEvmProviders, watchRobinhoodWallet, type Eip1193Provider, type RobinhoodWalletSession} from "@/lib/chain/evm-wallet.ts";
import {createRobinhoodLaunchAdapter} from "@/lib/chain/robinhood-adapter.ts";
import {ROBINHOOD_FACTORY_ADDRESS} from "@/lib/chain/robinhood-factory.ts";
import {ROBINHOOD_CHAIN_TESTNET} from "@/lib/chain/robinhood-testnet.ts";
import {type TradeEvent, formatUnits18, parseUnits18, prepareWrap, submitTransaction, type Market, type TradePlan, type Transaction} from "@/lib/chain/robinhood-market.ts";

import {restoreTrade, type StoredTrade} from "@/lib/chain/robinhood-history.ts";

type Fees = {market: Market; platform: bigint; creator: bigint; trade: bigint};

export function RobinhoodMarket({tokenAddress}: {tokenAddress: string}) {
  const session = useRef<RobinhoodWalletSession | null>(null);
  const [walletProvider, setWalletProvider] = useState<Eip1193Provider | null>(null);
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("0.001");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [fees, setFees] = useState<Fees | null>(null);
  const [history, setHistory] = useState<TradeEvent[] | null>(null);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyComplete, setHistoryComplete] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [plan, setPlan] = useState<TradePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hash, setHash] = useState("");
  const [status, setStatus] = useState("");
  const adapter = createRobinhoodLaunchAdapter();
  const pending = !!hash && status === "pending";
  const locked = busy || pending;
  const enabled = ROBINHOOD_FACTORY_ADDRESS != null;

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Testnet request failed."); }
    finally { setBusy(false); }
  }
  async function requestHistory(before?: string) {
    const url = new URL("/api/robinhood/history", window.location.origin);
    url.searchParams.set("token", tokenAddress);
    if (before) url.searchParams.set("before", before);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Trade history unavailable. Retry refresh.");
    return await response.json() as {trades: StoredTrade[]; nextCursor: string | null};
  }
  function acceptHistory(page: {trades: StoredTrade[]; nextCursor: string | null}, older: boolean) {
    const events = page.trades.map(restoreTrade);
    setHistory(previous => {
      const merged = [...(older ? previous ?? [] : []), ...events];
      return [...new Map(merged.map(event => [event.transactionHash + ":" + event.logIndex, event])).values()];
    });
    setHistoryCursor(page.nextCursor); setHistoryComplete(page.nextCursor === null); setHistoryError("");
  }
  async function loadHistory(older = false) {
    acceptHistory(await requestHistory(older ? historyCursor ?? undefined : undefined), older);
  }
  useEffect(() => {
    let active = true;
    if (enabled) void requestHistory().then(page => {if (active) acceptHistory(page, false);}).catch(() => {if (active) setHistoryError("Trade history is unavailable. Retry refresh.");});
    return () => {active = false;};
    // Initial history is a public read and does not require wallet access.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenAddress, enabled]);
  async function refresh(owner = account) {
    const next = await adapter.getCreatorRewards(owner, tokenAddress) as Fees;
    if (session.current?.account !== owner) return;
    setFees(next);
    try { await loadHistory(); }
    catch { setHistoryError("Trade history is unavailable. Retry refresh."); }
  }
  async function connect() {
    const choice = (await discoverEvmProviders())[0];
    if (!choice) throw new Error("Install or unlock an EVM browser wallet.");
    // Provider connection selects testnet before requesting the account.
    const connected = await choice.connect(!!session.current);
    session.current = connected; setWalletProvider(connected.provider); setAccount(connected.account); setPlan(null);
    await refresh(connected.account);
  }
  useEffect(() => {
    const current = session.current;
    if (!walletProvider || !current) return;
    return watchRobinhoodWallet(current, next => {
      session.current = next; setAccount(next?.account ?? ""); setPlan(null); setFees(null);
      if (!next) { setWalletProvider(null); setError("Wallet disconnected or network changed. Reconnect on Robinhood Chain testnet."); }
      else void refresh(next.account).catch(() => setError("Refresh the market for the selected wallet."));
    });
    // The subscription follows this provider; refresh guards against stale account reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletProvider]);
  async function send(tx: Transaction) {
    const current = session.current;
    if (!current || current.account !== tx.from) throw new Error("Reconnect your wallet.");
    const sent = await submitTransaction(current.provider, tx);
    setHash(sent); setStatus("pending"); setPlan(null);
  }
  async function quote() {
    if (!session.current) throw new Error("Connect your wallet.");
    // Reconnect verifies current account and chain before preparing a review.
    const current = await connectRobinhoodTestnet(session.current.provider);
    session.current = current; setAccount(current.account);
    setPlan(await adapter.getQuote(current.account, tokenAddress, side, amount, 100) as TradePlan);
    await refresh(current.account);
  }
  async function execute() {
    if (!plan) return;
    if (Date.now() > plan.expiresAt) { setPlan(null); throw new Error("Quote expired. Get a fresh quote."); }
    await send(plan.approval ?? plan.transaction);
  }
  async function claim(kind: "creator" | "platform" | "trade") {
    await send(await adapter.claimCreatorRewards(account, kind, null, tokenAddress) as Transaction);
  }
  async function check() {
    const result = await adapter.getTransaction(hash) as string;
    setStatus(result);
    if (result !== "pending") await refresh();
  }

  return <section className="panel form-panel">
    <h2>testnet market</h2>
    <p>WETH curve trading. Test assets only. No graduation or holder-tax rewards.</p>
    {!enabled && <p role="status">Waiting for a verified testnet factory deployment.</p>}
    {enabled && !account && <Button disabled={busy} onClick={() => void run(connect)}>Connect testnet wallet</Button>}
    {account && <>
      <p className="address-line">{account}</p>
      <Button variant="outline" disabled={locked} onClick={() => void run(connect)}>Change wallet / refresh</Button>
      {fees && <dl>
        <div><dt>Real WETH reserve</dt><dd>{formatUnits18(fees.market.realQuote)}</dd></div>
        <div><dt>Tokens on curve</dt><dd>{formatUnits18(fees.market.inventory)}</dd></div>
        <div><dt>Fees per trade</dt><dd>Platform {Number(fees.market.platformFeeBps) / 100}%, creator {Number(fees.market.creatorFeeBps) / 100}%, trade {Number(fees.market.tradeFeeBps) / 100}%</dd></div>
        <div><dt>Creator fees accrued (WETH)</dt><dd>{formatUnits18(fees.creator)}</dd></div>
      </dl>}
      <label>Direction<select value={side} disabled={locked} onChange={e => {setSide(e.target.value as "buy" | "sell"); setPlan(null);}}>
        <option value="buy">Buy with WETH</option><option value="sell">Sell tokens for WETH</option>
      </select></label>
      <label>Amount ({side === "buy" ? "WETH" : "tokens"})<Input value={amount} disabled={locked} onChange={e => {setAmount(e.target.value); setPlan(null);}}/></label>
      {side === "buy" && <Button variant="outline" disabled={locked} onClick={() => void run(async () => {
        setPlan(null); await send(prepareWrap(account, parseUnits18(amount)));
      })}>Wrap this amount of testnet ETH into WETH</Button>}
      <p>Keep testnet ETH available for gas. Wrapping and token approval are separate wallet transactions.</p>
      <Button disabled={locked} onClick={() => void run(quote)}>Review quote (1% slippage)</Button>
      {plan && <div className="receipt">
        <p>Expected output: {formatUnits18(plan.output)}. Minimum: {formatUnits18(plan.minimum)} {side === "buy" ? "tokens" : "WETH"}.</p>
        <p>Fees in WETH: platform {formatUnits18(plan.fees.platform)}, creator {formatUnits18(plan.fees.creator)}, trade {formatUnits18(plan.fees.trade)}.</p>
        <p>{plan.approval ? "Approve only the entered amount, confirm it, then request a fresh quote." : "Review the trade in your wallet. This quote expires after one minute."}</p>
        <Button disabled={locked} onClick={() => void run(execute)}>{plan.approval ? "Approve exact amount" : "Submit reviewed trade"}</Button>
      </div>}
      {fees && account === fees.market.creator && <Button variant="outline" disabled={locked || fees.creator === 0n} onClick={() => void run(() => claim("creator"))}>Claim creator WETH fees</Button>}
      {fees && account === fees.market.platform && <>
        <Button variant="outline" disabled={locked || fees.platform === 0n} onClick={() => void run(() => claim("platform"))}>Claim platform fees ({formatUnits18(fees.platform)} WETH)</Button>
        <Button variant="outline" disabled={locked || fees.trade === 0n} onClick={() => void run(() => claim("trade"))}>Claim trade fees ({formatUnits18(fees.trade)} WETH)</Button>
      </>}
    </>}
    {hash && <div className="receipt">
      <p role="status">Transaction: {status}</p>
      <a href={ROBINHOOD_CHAIN_TESTNET.blockExplorerUrl + "/tx/" + hash} target="_blank" rel="noreferrer">View transaction</a>
      <Button variant="outline" disabled={busy} onClick={() => void run(check)}>Check transaction and refresh</Button>
    </div>}
    {history && <div>
      <h3>Trade history</h3><p>{historyComplete ? "History checked back to token creation." : "Confirmed trades saved across visits. Load earlier history to continue back to creation."}</p>
      {history.length === 0 && <p>No trades in the blocks checked so far.</p>}
      <ul>{history.map(event => <li key={event.transactionHash + ":" + event.logIndex.toString()}>
        <a href={ROBINHOOD_CHAIN_TESTNET.blockExplorerUrl + "/tx/" + event.transactionHash} target="_blank" rel="noreferrer">
          {event.side}: {formatUnits18(event.amountIn)} {event.side === "buy" ? "WETH" : "tokens"} → {formatUnits18(event.amountOut)} {event.side === "buy" ? "tokens" : "WETH"}
        </a>
      </li>)}</ul>
    </div>}
    {historyError && <p role="status">{historyError}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
