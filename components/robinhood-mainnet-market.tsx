"use client";
import {useEffect, useEffectEvent, useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {ROBINHOOD_CHAIN_MAINNET} from "@/lib/chain/robinhood-mainnet.ts";
import {isReviewedMainnetFactory} from "@/lib/chain/robinhood-mainnet-factories.ts";
import {address, bytes32, formatUnits18, parseUnits18, prepareWrap, prepareClaim, readFees, submitTransaction, transactionStatus, uintWord, type Rpc, type Transaction} from "@/lib/chain/robinhood-market.ts";
import {readMainnetMarket, prepareMainnetTrade, prepareMainnetGraduationRetry, assertMainnetTradeFresh, type MainnetMarket, type MainnetTradePlan} from "@/lib/chain/robinhood-mainnet-market.ts";
import {type MainnetWalletSession} from "@/lib/chain/robinhood-mainnet-wallet.ts";
import type {MainnetLaunchRecord} from "@/lib/chain/robinhood-mainnet-registration.ts";
import {RobinhoodMainnetHistory} from "./robinhood-mainnet-history";
import type {RobinhoodDisplayMarket} from "@/lib/chain/robinhood-market-display.ts";
import {robinhoodDisplayUnits} from "@/lib/chain/robinhood-market-display.ts";
import {TradeFields} from './trade-fields';
import {TradeWalletNotice} from './trade-wallet-notice';
import {useSharedMainnetWallet} from './use-site-wallet';
import {openSiteWallet} from '@/lib/site-wallet-session.mjs';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from './ui/dialog';
import {X} from "lucide-react";
import {readWalletSubmission,journalWalletRequest,assertRecoveredSubmission} from "@/lib/wallet-submission-journal.mjs";

type Balances = {platform: bigint; creator: bigint; trade: bigint; poolPlatformWeth: bigint; poolCreatorWeth: bigint; poolPlatformToken: bigint; poolCreatorToken: bigint; native:bigint; weth:bigint; token:bigint};
const scalar = (value: unknown): bigint => {if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/i.test(value)) throw new Error("Invalid fee balance.");return BigInt(value);};
export function RobinhoodMainnetMarket({record,embedded=false,sheetOpen=false,onClose,preferredSide="buy",onHistoryRefresh,onBusyChange}: {record:MainnetLaunchRecord;embedded?:boolean;sheetOpen?:boolean;onClose?:()=>void;preferredSide?:"buy"|"sell";snapshot?:RobinhoodDisplayMarket|null;onHistoryRefresh?:()=>void;onBusyChange?:(busy:boolean)=>void}) {
  // A token trades through its own factory's curve and vault (derived and cross-checked on-chain by the market reader).
  const enabled = isReviewedMainnetFactory(record.factory);
  const [session, setSession] = useState<MainnetWalletSession | null>(null); const current = useRef<MainnetWalletSession | null>(null);
  const [market, setMarket] = useState<MainnetMarket | null>(null); const [balances, setBalances] = useState<Balances | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy"); const [amount, setAmount] = useState("");
  const [plan, setPlan] = useState<MainnetTradePlan | null>(null); const [hash, setHash] = useState(""); const [status, setStatus] = useState("pending");
  const [recovery, setRecovery] = useState(""); const [busy, setBusy] = useState(""); const working = useRef(false);
  const [error, setError] = useState("");const [historyRevision,setHistoryRevision]=useState(0),[wrapOpen,setWrapOpen]=useState(false),[wrapAmount,setWrapAmount]=useState(""),[pending,setPending]=useState(false);const pendingHash=useRef("");const operationSession=useRef<MainnetWalletSession|null>(null);
  const storageKey = (account: string) => "grainpad:4663:trade:" + record.tokenAddress + ":" + account;
  const walletRpc = (active: MainnetWalletSession): Rpc => (method, params) => active.provider.request({method, params});
  useSharedMainnetWallet(current,next=>{
    setSession(next);setPlan(null);setMarket(null);setBalances(null);setHash("");setRecovery("");setStatus("pending");setWrapOpen(false);setPending(false);pendingHash.current="";
    if(next)loadPending(next);
  });
  useEffect(()=>{if(!working.current&&!pendingHash.current){setSide(preferredSide);setPlan(null);}},[preferredSide]);
  useEffect(()=>{if(!session)return;void Promise.resolve().then(()=>run("Reading wallet balances",()=>refresh(session),true));
  // The store supplies a stable session identity until an account/network event invalidates it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[session]);
  async function refresh(active = current.current) {
    if (!active) return;
    const rpc = walletRpc(active); const next = await readMainnetMarket(rpc, record); const fees = next.continuous ? {platform:0n,creator:0n,trade:0n} : await readFees(rpc, next);
    const readPool = async (selector: string, asset: string) => next.locker ? scalar(await rpc("eth_call", [{to: next.locker, data: selector + uintWord(BigInt(address(asset)))}, "latest"])) : 0n;
    const payee=active.account===next.creator||active.account===next.platform;
    const values = payee?await Promise.all([readPool("0x240b9586", next.quote), readPool("0x68eb4512", next.quote), readPool("0x240b9586", next.tokenAddress), readPool("0x68eb4512", next.tokenAddress)]):[0n,0n,0n,0n];
    const [native,weth,token]=await Promise.all([rpc("eth_getBalance",[active.account,next.block]),rpc("eth_call",[{to:next.quote,data:"0x70a08231"+uintWord(BigInt(address(active.account)))},next.block]),rpc("eth_call",[{to:next.tokenAddress,data:"0x70a08231"+uintWord(BigInt(address(active.account)))},next.block])]);
    if(typeof native!=="string"||!/^0x[0-9a-f]+$/i.test(native))throw Error("Wallet balance unavailable.");
    if (current.current !== active) return;
    setMarket(next); setBalances({...fees, poolPlatformWeth: values[0], poolCreatorWeth: values[1], poolPlatformToken: values[2], poolCreatorToken: values[3],native:BigInt(native),weth:scalar(weth),token:scalar(token)});
  }
  async function run(label: string, job: () => Promise<void>,readOnly=false) {
    if(working.current)return;if(!readOnly&&pendingHash.current){setError("Check the pending transaction before starting another action.");return;}
    working.current=true;operationSession.current=current.current;onBusyChange?.(true);setBusy(label);setError("");
    try{await job();}catch(cause){setError(cause instanceof Error?cause.message:"Please retry.");}
    finally{working.current=false;operationSession.current=null;onBusyChange?.(!!pendingHash.current);setBusy("");}
  }
  function sameWallet(active:MainnetWalletSession){const next=current.current;return !!next&&next.account===active.account&&next.chainId===active.chainId&&next.provider===active.provider;}
  function showPending(active:MainnetWalletSession,saved:{hash:string|null}|null){
    if(!sameWallet(active))return;pendingHash.current=saved?(saved.hash??"unknown"):"";setPending(!!saved);setHash(saved?.hash??"");setRecovery(saved?.hash??"");if(saved&&!saved.hash)setError("A wallet request is awaiting a result or has an unknown outcome. Check wallet activity. Automatic retry remains blocked until the original request can be verified.");
  }
  function loadPending(active:MainnetWalletSession){
    if(!sameWallet(active))return;
    try{showPending(active,readWalletSubmission(localStorage,storageKey(active.account)));}
    catch{pendingHash.current="unknown";setPending(true);setError("Transaction recovery storage is unavailable. Do not submit again until the previous wallet request is checked.");}
  }
  useEffect(()=>{onBusyChange?.(!!busy||pending);},[busy,pending,onBusyChange]);
  const storageChanged=useEffectEvent((event:StorageEvent)=>{const active=current.current;if(active&&event.key===storageKey(active.account))loadPending(active);});
  useEffect(()=>{const changed=(event:StorageEvent)=>storageChanged(event);window.addEventListener("storage",changed);return()=>window.removeEventListener("storage",changed);},[]);
  async function send(tx: Transaction) {
    const expected=current.current;if(!expected||operationSession.current!==expected)throw Error("Wallet changed. Review again.");
    const response = await fetch("/api/robinhood/mainnet/provenance?token=" + encodeURIComponent(record.tokenAddress),{cache:"no-store"});
    const admission = await response.json() as {admitted?:boolean;error?:string;reason?:string};
    if (!response.ok || admission.admitted !== true) throw new Error(admission.error ?? admission.reason ?? "Monero registration is not currently verified.");
    const active = current.current; if (!active || active !== expected || operationSession.current!==active || active.account !== tx.from) throw new Error("Reconnect and review again.");
    if(!navigator.locks)throw Error("This browser cannot safely coordinate wallet requests. Use a current browser.");
    await navigator.locks.request(storageKey(active.account),{ifAvailable:true},async lock=>{
      if(!lock)throw Error("Another tab is handling this wallet request. Check it there first.");
      const provider={request:async (args:Parameters<MainnetWalletSession["provider"]["request"]>[0])=>{
        if(args.method!=="eth_sendTransaction")return active.provider.request(args);
        if(current.current!==active||operationSession.current!==active)throw Error("Wallet changed. Review again.");
        return journalWalletRequest({storage:localStorage,key:storageKey(active.account),transaction:tx,request:()=>active.provider.request(args),onChange:(item:{hash:string|null}|null)=>{if(sameWallet(active)){showPending(active,item);setPlan(null);setWrapOpen(false);setStatus("pending");}}});
      }};
      await submitTransaction(provider,tx);
      // A→B→A is allowed to recover the hash, but never authorizes a stale send.
      if(sameWallet(active))loadPending(active);
      else throw Error("The previous wallet submitted a transaction. Reconnect that wallet to check its receipt.");
    });
  }
  async function review() {
    const active = current.current; if (!active) throw new Error("Connect your mainnet wallet.");
    const next = await readMainnetMarket(walletRpc(active), record);
    const proposal = await prepareMainnetTrade(walletRpc(active), next, active.account, side, parseUnits18(amount), 100);
    if (current.current !== active) throw new Error("Wallet changed. Review again.");
    setMarket(next);setPlan(proposal);
  }
  async function execute() {
    if (!plan) return;
    try {assertMainnetTradeFresh(plan);} catch (cause) {setPlan(null);throw cause;}
    await send(plan.approval ?? plan.transaction);
  }
  async function check(transactionHash = hash) {
    const active = current.current;if (!active) throw new Error("Connect your mainnet wallet.");
    const verified = bytes32(transactionHash);
    if(!navigator.locks)throw Error("This browser cannot safely coordinate receipt recovery.");
    await navigator.locks.request(storageKey(active.account),{ifAvailable:true},async lock=>{
      if(!lock)throw Error("Another tab is handling this wallet request. Check it there first.");
      const saved=readWalletSubmission(localStorage,storageKey(active.account));
      if(saved){if(saved.hash&&saved.hash!==verified)throw Error("Check the pending transaction hash before another receipt.");assertRecoveredSubmission(saved,await walletRpc(active)("eth_getTransactionByHash",[verified]));}
      if(current.current!==active)throw Error("Wallet changed. Check with the original wallet.");
      const state=await transactionStatus(walletRpc(active),verified,"robinhood:mainnet");
      if(current.current!==active)throw Error("Wallet changed. Check with the original wallet.");
      // Recovery and submission share one cross-tab lock; never remove a newer attempt.
      const latest=readWalletSubmission(localStorage,storageKey(active.account));
      if(JSON.stringify(latest)!==JSON.stringify(saved))throw Error("The pending request changed. Check it again.");
      setHash(verified);setStatus(state);
      if(state!=="pending"&&saved){localStorage.removeItem(storageKey(active.account));pendingHash.current="";setPending(false);}
    });
    setPlan(null);await refresh(active);setHistoryRevision(n=>n+1);onHistoryRefresh?.();
  }
  const feePayee = !!market && !!session && (session.account === market.creator || session.account === market.platform);
  async function poolClaim(asset: string, creatorBucket: boolean) {
    const active = current.current;if (!active || !market?.locker) throw new Error("No locked pool position.");
    await send({from: active.account, to: market.locker, data: "0x92fd2daf" + uintWord(BigInt(address(asset))) + uintWord(creatorBucket ? 1n : 0n), value: "0x0", chainId: "0x1237"});
  }
  const disabled=!!busy||pending;
  const compact=(value:bigint)=>robinhoodDisplayUnits(value.toString());
  const switchSide=(direction:"buy"|"sell")=>{if(disabled)return;setSide(direction);setAmount("");setPlan(null);};
  return <><section id={embedded?"robinhood-swap":undefined} tabIndex={embedded?-1:undefined} className={embedded?`panel corner-panel token-swap${sheetOpen?" is-open":""}`:"panel form-panel token-swap"} aria-label="Swap tokens on Robinhood Chain" role={sheetOpen?"dialog":undefined} aria-modal={sheetOpen||undefined}>
    <div className="corner-head"><span className="corner-label">Swap</span><span className="corner-label is-right">Robinhood Chain</span>{embedded&&<button className="sheet-close" aria-label="Close swap" onClick={onClose}><X size={18}/></button>}</div>
    <TradeWalletNotice network="robinhood"/>
    {!enabled?<p role="status">Mainnet launching is not yet available.</p>:<>
      <TradeFields symbol={record.symbol} paymentSymbol="WETH" side={side} setSide={switchSide} amount={amount} setAmount={value=>{setAmount(value);setPlan(null);}} inputId="rh-swap-amount" disabled={disabled} balanceLabel={balances?`Balance: ${compact(side==="buy"?balances.weth:balances.token)} ${side==="buy"?"WETH":record.symbol}`:session?"Reading wallet balance…":"Connect to see your balance"} output={plan?compact(plan.output):"—"} outputHint={plan?"Estimated · final amounts in wallet":session?"Enter an amount, then review the quote":"Connect your Robinhood Chain wallet to review a quote"} onReverse={()=>switchSide(side==="buy"?"sell":"buy")}/>
      <p className="small muted">Slippage: 1%. ETH pays network gas; this pair trades in WETH.</p>
      {session&&side==="buy"&&<div className="swap-funding"><p className="small muted">{balances?`ETH for gas: ${compact(balances.native)}. `:""}Need WETH? Wrapping ETH is a separate wallet transaction.</p><Button variant="outline" disabled={disabled} onClick={()=>setWrapOpen(true)}>Get WETH</Button></div>}
      {pending&&<p className="feedback" role="status">A transaction is pending. Check its receipt below before another action.</p>}
      <Button className="primary-action" disabled={!!busy||pending||!!session&&(!market||!amount)} onClick={()=>session?void run("Preparing quote",review):openSiteWallet("robinhood")}>{busy||(pending?"Transaction pending…":!session?"Connect wallet":`${side==="buy"?"Buy":"Sell"} ${record.symbol}`)}</Button>
      {session&&!market&&!busy&&<Button variant="outline" onClick={()=>void run("Reading wallet balances",()=>refresh(),true)}>Retry balance read</Button>}
      {hash&&<div className="receipt" role="status"><p>{status==="success"?"Transaction confirmed. Review a fresh quote for the next action.":status==="reverted"?"Transaction reverted. No automatic retry.":"Checking an existing transaction does not submit it again."}</p><a href={ROBINHOOD_CHAIN_MAINNET.blockExplorerUrl+"/tx/"+hash} target="_blank" rel="noreferrer">View transaction ↗</a><Button variant="outline" disabled={!!busy||!session} onClick={()=>void run("Checking transaction",()=>check(),true)}>Check transaction</Button></div>}
      {session&&<details className="trade-recovery" open={pending&&!hash||undefined}><summary>Check a previous transaction</summary><label>Transaction hash<Input value={recovery} disabled={!!busy} onChange={event=>setRecovery(event.target.value)} placeholder="0x transaction hash"/></label><Button variant="outline" disabled={!!busy||!recovery} onClick={()=>void run("Checking earlier transaction",()=>check(recovery),true)}>Check receipt</Button><p className="small muted">This only checks a receipt. It never repeats a trade or payment.</p></details>}
    </>}
    {error&&<p role="alert" className="feedback error">{error}</p>}
  </section>
  {market&&session&&feePayee&&<details className="panel corner-panel rh-creator-tools"><summary>{session.account===market.creator?"Creator tools":"Platform tools"}</summary><p className="small muted">Fee collection and withdrawal are separate from buying or selling. Each action needs wallet approval and network gas.</p>
    <dl className="product-facts"><div><dt>Venue</dt><dd>{market.continuous||market.graduated?"Uniswap v3":"WETH curve"}</dd></div><div><dt>Pool WETH</dt><dd title={formatUnits18(market.realQuote)}>{compact(market.realQuote)}</dd></div><div><dt>Pool tokens</dt><dd title={formatUnits18(market.inventory)}>{compact(market.inventory)}</dd></div></dl>
    {market.pool&&<a href={ROBINHOOD_CHAIN_MAINNET.blockExplorerUrl+"/address/"+market.pool} target="_blank" rel="noreferrer">View pool ↗</a>} {market.locker&&<a href={ROBINHOOD_CHAIN_MAINNET.blockExplorerUrl+"/address/"+market.locker} target="_blank" rel="noreferrer">View liquidity lock ↗</a>}
    {market.graduationPending&&<Button variant="outline" disabled={disabled} onClick={()=>void run("Retrying DEX migration",()=>send(prepareMainnetGraduationRetry(market,session.account)))}>Retry DEX migration</Button>}
    {balances&&!market.continuous&&session.account===market.creator&&balances.creator>0n&&<Button variant="outline" disabled={disabled} onClick={()=>void run("Claiming creator curve fees",async()=>send(await prepareClaim(walletRpc(session),market,session.account,1)))}>Claim creator curve fees</Button>}
    {balances&&!market.continuous&&session.account===market.platform&&balances.platform>0n&&<Button variant="outline" disabled={disabled} onClick={()=>void run("Claiming platform curve fees",async()=>send(await prepareClaim(walletRpc(session),market,session.account,0)))}>Claim platform curve fees</Button>}
    {balances&&(market.graduated||market.continuous)&&market.locker&&<div className="receipt"><h3>Pool fees</h3><Button variant="outline" disabled={disabled} onClick={()=>void run("Collecting new pool fees",()=>send({from:session.account,to:market.locker!,data:"0xe5225381",value:"0x0",chainId:"0x1237"}))}>Collect pool fees</Button>
      {([true,false] as const).filter(creatorBucket=>session.account===(creatorBucket?market.creator:market.platform)).map(creatorBucket=><div key={String(creatorBucket)}><p>Claimable: {compact(creatorBucket?balances.poolCreatorWeth:balances.poolPlatformWeth)} WETH · {compact(creatorBucket?balances.poolCreatorToken:balances.poolPlatformToken)} {record.symbol}</p><p className="small muted">Claimable amounts exclude uncollected fees. Token fees remain token assets.</p><Button variant="outline" disabled={disabled||(creatorBucket?balances.poolCreatorWeth:balances.poolPlatformWeth)===0n} onClick={()=>void run("Claiming pool WETH",()=>poolClaim(market.quote,creatorBucket))}>Claim WETH</Button><Button variant="outline" disabled={disabled||(creatorBucket?balances.poolCreatorToken:balances.poolPlatformToken)===0n} onClick={()=>void run("Claiming pool tokens",()=>poolClaim(market.tokenAddress,creatorBucket))}>Claim token fees</Button></div>)}
    </div>}
  </details>}
  <Dialog open={!!plan} onOpenChange={open=>{if(!open&&!busy)setPlan(null);}}><DialogContent className="trade-flow-dialog"><DialogHeader><DialogTitle>Review {side} · {record.symbol}</DialogTitle><DialogDescription>Robinhood Chain · WETH pair. Your wallet shows the exact transaction.</DialogDescription></DialogHeader>{plan&&<><dl><div><dt>You pay</dt><dd>{amount} {side==="buy"?"WETH":record.symbol}</dd></div><div><dt>Estimated receive</dt><dd>{compact(plan.output)} {side==="buy"?record.symbol:"WETH"}</dd></div><div><dt>Minimum receive</dt><dd>{compact(plan.minimum)} {side==="buy"?record.symbol:"WETH"}</dd></div><div><dt>Slippage</dt><dd>1%</dd></div></dl><p className="small muted">{plan.approval?"Approve only the entered amount. After confirmation, review a fresh quote to trade.":"The quote expires after one minute. Network gas is separate."}</p><Button className="primary-action" disabled={disabled} onClick={()=>void run("Review in wallet",execute)}>{plan.approval?"Approve exact amount":`Confirm ${side} in wallet`}</Button></>}{error&&<p role="alert">{error}</p>}</DialogContent></Dialog>
  <Dialog open={wrapOpen} onOpenChange={open=>{if(!busy)setWrapOpen(open);}}><DialogContent className="trade-flow-dialog"><DialogHeader><DialogTitle>Get WETH</DialogTitle><DialogDescription>Wrap ETH on Robinhood Chain. This is a separate transaction; it does not buy the token.</DialogDescription></DialogHeader><label>ETH to wrap<Input inputMode="decimal" value={wrapAmount} disabled={disabled} onChange={event=>setWrapAmount(event.target.value)} placeholder="0"/></label><p className="small muted">Keep ETH for gas. After confirmation, check the receipt and return to the token quote.</p><Button disabled={disabled||!session||!wrapAmount} onClick={()=>void run("Review wrap in wallet",()=>send(prepareWrap(session!.account,parseUnits18(wrapAmount),"robinhood:mainnet")))}>Review wrap in wallet</Button>{error&&<p role="alert">{error}</p>}</DialogContent></Dialog>
  {!embedded&&<RobinhoodMainnetHistory record={record} enabled={enabled} refreshKey={historyRevision}/>}</>;
}
