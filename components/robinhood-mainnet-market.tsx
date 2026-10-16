"use client";
import {useEffect, useEffectEvent, useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {ROBINHOOD_CHAIN_MAINNET} from "@/lib/chain/robinhood-mainnet.ts";
import {isReviewedMainnetFactory} from "@/lib/chain/robinhood-mainnet-factories.ts";
import {address, bytes32, formatUnits18, prepareClaim, readFees, submitTransaction, transactionStatus, uintWord, type Rpc, type Transaction} from "@/lib/chain/robinhood-market.ts";
import {readMainnetMarket, prepareMainnetGraduationRetry, MAINNET_V3_ROUTER, type MainnetMarket} from "@/lib/chain/robinhood-mainnet-market.ts";
import {type MainnetWalletSession} from "@/lib/chain/robinhood-mainnet-wallet.ts";
import type {MainnetLaunchRecord} from "@/lib/chain/robinhood-mainnet-registration.ts";
import {RobinhoodMainnetHistory} from "./robinhood-mainnet-history";
import type {RobinhoodDisplayMarket} from "@/lib/chain/robinhood-market-display.ts";
import {robinhoodDisplayUnits} from "@/lib/chain/robinhood-market-display.ts";
import {startIndicativeQuote} from '@/lib/trade-indicative-polling.mjs';
import {readMainnetPaymentEstimate} from '@/lib/chain/robinhood-mainnet-indicative.ts';
import {TradeFields} from './trade-fields';
import {TradeWalletNotice} from './trade-wallet-notice';
import {useSharedMainnetWallet} from './use-site-wallet';
import {openSiteWallet} from '@/lib/site-wallet-session.mjs';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from './ui/dialog';
import {X} from "lucide-react";
import {readWalletSubmission,journalWalletRequest,assertRecoveredSubmission} from "@/lib/wallet-submission-journal.mjs";

import {ROBINHOOD_USDG,parseMainnetPaymentAmount,prepareMainnetPaymentTrade,assertMainnetPaymentFresh,mainnetPaymentDecimals,type MainnetPaymentAsset,type MainnetPaymentPlan} from "@/lib/chain/robinhood-mainnet-payments.ts";

type TradeIntent = {side:"buy"|"sell";paymentAsset:MainnetPaymentAsset;amount:string};
const intentKey=(intent:TradeIntent)=>intent.paymentAsset+":"+intent.side+":"+intent.amount;
type Balances = {platform: bigint; creator: bigint; trade: bigint; poolPlatformWeth: bigint; poolCreatorWeth: bigint; poolPlatformToken: bigint; poolCreatorToken: bigint; native:bigint; weth:bigint; usdg:bigint|null; token:bigint};
const scalar = (value: unknown): bigint => {if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/i.test(value)) throw new Error("Invalid fee balance.");return BigInt(value);};
export function RobinhoodMainnetMarket({record,embedded=false,sheetOpen=false,onClose,preferredSide="buy",onHistoryRefresh,onBusyChange}: {record:MainnetLaunchRecord;embedded?:boolean;sheetOpen?:boolean;onClose?:()=>void;preferredSide?:"buy"|"sell";snapshot?:RobinhoodDisplayMarket|null;onHistoryRefresh?:()=>void;onBusyChange?:(busy:boolean)=>void}) {
  // A token trades through its own factory's curve and vault (derived and cross-checked on-chain by the market reader).
  const enabled = isReviewedMainnetFactory(record.factory);
  const [session, setSession] = useState<MainnetWalletSession | null>(null); const current = useRef<MainnetWalletSession | null>(null);
  const [market, setMarket] = useState<MainnetMarket | null>(null); const [balances, setBalances] = useState<Balances | null>(null);
  const [paymentAsset,setPaymentAsset]=useState<MainnetPaymentAsset>("USDG");
  const [side, setSide] = useState<"buy" | "sell">("buy"); const [amount, setAmount] = useState("");
  const [indicative,setIndicative]=useState<{key:string;status:string;quote:{output:bigint;outputDecimals:number;expiresAt:number}|null;error:string}>({key:'',status:'idle',quote:null,error:''});
  const [plan, setPlan] = useState<MainnetPaymentPlan | null>(null); const [hash, setHash] = useState(""); const [status, setStatus] = useState("pending");
  const [recovery, setRecovery] = useState(""); const [busy, setBusy] = useState(""); const working = useRef(false);
  const [notice,setNotice]=useState("");
  const [error, setError] = useState("");const [historyRevision,setHistoryRevision]=useState(0),[pending,setPending]=useState(false);const pendingHash=useRef("");const operationSession=useRef<MainnetWalletSession|null>(null);
  const journalIdentity=useRef({});
  useEffect(()=>()=>{current.current=null;},[]);
  const storageKey = (account: string) => "grainpad:4663:trade:" + record.tokenAddress + ":" + account;
  const walletRpc = (active: MainnetWalletSession): Rpc => (method, params) => active.provider.request({method, params});
  useSharedMainnetWallet(current,next=>{
    setSession(next);setNotice("");setPlan(null);setMarket(null);setBalances(null);setHash("");setRecovery("");setStatus("pending");setPending(false);pendingHash.current="";
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
    const [native,weth,token,usdg]=await Promise.all([rpc("eth_getBalance",[active.account,next.block]),rpc("eth_call",[{to:next.quote,data:"0x70a08231"+uintWord(BigInt(address(active.account)))},next.block]),rpc("eth_call",[{to:next.tokenAddress,data:"0x70a08231"+uintWord(BigInt(address(active.account)))},next.block]),rpc("eth_call",[{to:ROBINHOOD_USDG,data:"0x70a08231"+uintWord(BigInt(address(active.account)))},next.block]).catch(()=>null)]);
    if(typeof native!=="string"||!/^0x[0-9a-f]+$/i.test(native))throw Error("Wallet balance unavailable.");
    if (current.current !== active) return;
    setMarket(next); setBalances({...fees, poolPlatformWeth: values[0], poolCreatorWeth: values[1], poolPlatformToken: values[2], poolCreatorToken: values[3],native:BigInt(native),weth:scalar(weth),usdg:usdg===null?null:scalar(usdg),token:scalar(token)});
  }
  async function run(label: string, job: () => Promise<void>,readOnly=false) {
    if(working.current)return;if(!readOnly&&pendingHash.current){setError("Check the pending transaction before starting another action.");return;}
    working.current=true;operationSession.current=current.current;onBusyChange?.(true);setBusy(label);setError("");
    try{await job();}catch(cause){setError(cause instanceof Error?cause.message:"Please retry.");}
    finally{working.current=false;operationSession.current=null;onBusyChange?.(!!pendingHash.current);setBusy("");}
  }
  function sameWallet(active:MainnetWalletSession){const next=current.current;return !!next&&next.account===active.account&&next.chainId===active.chainId&&next.provider===active.provider;}
  function showPending(active:MainnetWalletSession,saved:{hash:string|null;context?:{kind?:string;paymentAsset?:string}}|null){
    if(!sameWallet(active))return;pendingHash.current=saved?(saved.hash??"unknown"):"";setPending(!!saved);setHash(saved?.hash??"");setRecovery(saved?.hash??"");setError(saved&&!saved.hash&&!working.current?"A wallet request has an unknown outcome. Check wallet activity before trying again.":"");
    if(!saved)setNotice("");else setNotice(saved.hash?saved.context?.kind==="approval"?`${saved.context.paymentAsset} approval submitted. Checking confirmation automatically…`:"Transaction submitted. Checking confirmation automatically…":"Confirm the request in your wallet. Waiting for its result…");
  }
  function loadPending(active:MainnetWalletSession){
    if(!sameWallet(active))return;
    try{showPending(active,readWalletSubmission(localStorage,storageKey(active.account)));}
    catch{pendingHash.current="unknown";setPending(true);setError("Transaction recovery storage is unavailable. Do not submit again until the previous wallet request is checked.");}
  }
  useEffect(()=>{onBusyChange?.(!!busy||pending);},[busy,pending,onBusyChange]);
  const storageChanged=useEffectEvent((event:StorageEvent)=>{const active=current.current;if(active&&event.key===storageKey(active.account))loadPending(active);});
  function notifyJournal(key:string){window.dispatchEvent(new CustomEvent("grainpad-wallet-submission",{detail:{key,source:journalIdentity.current}}));}
  useEffect(()=>{
    const changed=(event:StorageEvent)=>storageChanged(event);
    const sameDocument=(event:Event)=>{const detail=(event as CustomEvent<{key:string;source:unknown}>).detail;if(detail?.source!==journalIdentity.current)storageChanged({key:detail?.key} as StorageEvent);};
    window.addEventListener("storage",changed);window.addEventListener("grainpad-wallet-submission",sameDocument);
    return()=>{window.removeEventListener("storage",changed);window.removeEventListener("grainpad-wallet-submission",sameDocument);};
  },[]);
  async function send(tx: Transaction,intent?:TradeIntent) {
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
        return journalWalletRequest({storage:localStorage,key:storageKey(active.account),transaction:tx,context:intent?{...intent,kind:tx.data.startsWith("0x095ea7b3")?"approval":"trade"}:null,request:()=>active.provider.request(args),onChange:(item:{hash:string|null}|null)=>{if(sameWallet(active)){showPending(active,item);setPlan(null);setStatus("pending");}notifyJournal(storageKey(active.account));}});
      }};
      await submitTransaction(provider,tx);
      // A→B→A is allowed to recover the hash, but never authorizes a stale send.
      if(sameWallet(active))loadPending(active);
      else throw Error("The previous wallet submitted a transaction. Reconnect that wallet to check its receipt.");
    });
  }
  async function review(selection:TradeIntent={side,paymentAsset,amount}) {
    const active = current.current; if (!active) throw new Error("Connect your mainnet wallet.");
    const intent=intentKey(selection);if(paymentIntent.current!==intent)throw Error("Amount or payment currency changed. Review again.");
    const next = await readMainnetMarket(walletRpc(active), record);
    const proposal = await prepareMainnetPaymentTrade(walletRpc(active), next, active.account, selection.side, parseMainnetPaymentAmount(selection.amount,selection.paymentAsset,selection.side), 100,selection.paymentAsset);
    if(paymentIntent.current!==intent)throw Error("Amount or payment currency changed. Review again.");
    if (current.current !== active) throw new Error("Wallet changed. Review again.");
    setMarket(next);setPlan(proposal);
  }
  async function execute() {
    if (!plan) return;
    try {assertMainnetPaymentFresh(plan);if(plan.paymentAsset!==paymentAsset||plan.side!==side||plan.amount!==parseMainnetPaymentAmount(amount,paymentAsset,side))throw Error("Payment changed. Review again.");} catch (cause) {setPlan(null);throw cause;}
    await send(plan.approval ?? plan.transaction,{side:plan.side,paymentAsset:plan.paymentAsset,amount});
  }
  function approvedIntent(saved:ReturnType<typeof readWalletSubmission>):TradeIntent|null {
    const context=saved?.context,tx=saved?.transaction;
    if(context?.kind!=="approval"||!["buy","sell"].includes(context.side)||!["USDG","ETH"].includes(context.paymentAsset)||typeof context.amount!=="string"||!tx)return null;
    try{
      const selection:TradeIntent={side:context.side,paymentAsset:context.paymentAsset,amount:context.amount};
      const value=parseMainnetPaymentAmount(selection.amount,selection.paymentAsset,selection.side);
      const token=selection.side==="buy"?ROBINHOOD_USDG:record.tokenAddress;
      if(selection.side==="buy"&&selection.paymentAsset!=="USDG"||tx.to!==token||tx.value!=="0x0"||tx.chainId!=="0x1237"||tx.data!=="0x095ea7b3"+uintWord(BigInt(MAINNET_V3_ROUTER))+uintWord(value))return null;
      return selection;
    }catch{return null;}
  }
  async function check(transactionHash = hash) {
    const active = current.current;if (!active) throw new Error("Connect your mainnet wallet.");
    const verified = bytes32(transactionHash);let resume:TradeIntent|null=null,settled=false;
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
      setHash(verified);setStatus(state);settled=state!=="pending";
      if(state!=="pending"&&saved){
        // Only the matching, settled receipt releases the original request. Quoting never sends.
        resume=state==="success"?approvedIntent(saved):null;
        localStorage.removeItem(storageKey(active.account));notifyJournal(storageKey(active.account));pendingHash.current="";setPending(false);setError("");
        setNotice(resume?`${resume.paymentAsset} approval confirmed. Step 2: review your ${resume.side==="buy"?"purchase":"sale"}, then confirm it in your wallet.`:state==="success"?"Transaction confirmed.":"Transaction failed on-chain. Nothing was retried.");
      }
    });
    if(!settled)return;
    setPlan(null);
    // Restore the reviewed input after reload; an approval is never treated as a completed swap.
    const selection=resume as TradeIntent|null;
    if(selection&&(!amount||paymentIntent.current===intentKey(selection))){
      setSide(selection.side);setPaymentAsset(selection.paymentAsset);setAmount(selection.amount);paymentIntent.current=intentKey(selection);
      await refresh(active);
      if(current.current===active&&paymentIntent.current===intentKey(selection))await review(selection);
    }else await refresh(active);
    setHistoryRevision(n=>n+1);onHistoryRefresh?.();
  }
  const checkPending=useEffectEvent(async(active:MainnetWalletSession,transactionHash:string)=>{
    if(current.current!==active||pendingHash.current!==transactionHash||working.current)return;
    await run("Checking confirmation",()=>check(transactionHash),true);
  });
  useEffect(()=>{
    if(!session||!pending||!hash)return;
    let cancelled=false,attempts=0;let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      if(cancelled||current.current!==session||pendingHash.current!==hash)return;
      if(!working.current){attempts++;await checkPending(session,hash);}
      if(!cancelled&&pendingHash.current===hash){
        if(attempts<12)timer=setTimeout(()=>void poll(),3000);
        else setNotice("Confirmation is still pending. Use Check transaction to check again; nothing will be submitted twice.");
      }
    };
    timer=setTimeout(()=>void poll(),500);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[session,pending,hash]);
  const feePayee = !!market && !!session && (session.account === market.creator || session.account === market.platform);
  async function poolClaim(asset: string, creatorBucket: boolean) {
    const active = current.current;if (!active || !market?.locker) throw new Error("No locked pool position.");
    await send({from: active.account, to: market.locker, data: "0x92fd2daf" + uintWord(BigInt(address(asset))) + uintWord(creatorBucket ? 1n : 0n), value: "0x0", chainId: "0x1237"});
  }
  const estimateKey=JSON.stringify([record.factory,record.tokenAddress,session?.account,session?.chainId,side,amount,paymentAsset,market?.pool,market?.quote,market?.tokenAddress,market?.continuous,market?.graduated]);
  const reviewing=!!plan;
  useEffect(()=>{
    if(!session||!market||market.tokenAddress!==record.tokenAddress||!amount||pending||busy||reviewing){let live=true;void Promise.resolve().then(()=>{if(live)setIndicative({key:"",status:"idle",quote:null,error:""});});return()=>{live=false;};}
    const active=session;
    return startIndicativeQuote({read:(signal:AbortSignal)=>readMainnetPaymentEstimate(walletRpc(active),market,side,amount,paymentAsset,signal),publish:(value:{status:string;quote:{output:bigint;outputDecimals:number;expiresAt:number}|null;error:string})=>{if(current.current===active)setIndicative({...value,key:estimateKey});}});
  // The display quote is bound to immutable route/input values; balance/statistics refreshes must not restart it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[session,estimateKey,pending,busy,reviewing]);
  const estimateCurrent=indicative.key===estimateKey,estimateReady=estimateCurrent&&indicative.status==="ready"&&!!indicative.quote&&!pending&&!busy;
  const feeExplanation=market?(market.continuous||market.graduated?"Grainpad: 35% of collected net LP fees. Creator: 65%. Protocol deductions and liquidity share affect earnings.":"Grainpad: 0.35% of the trade. Creator: 0.65%. Both are included in the 1% trading fee."):"Grainpad and creator shares are verified with the quote.";
  const disabled=!!busy||pending;
  const compact=(value:bigint,decimals=18)=>robinhoodDisplayUnits((value*10n**BigInt(18-decimals)).toString());
  const paymentIntent=useRef("");paymentIntent.current=paymentAsset+":"+side+":"+amount;
  const paymentBalance=balances?(paymentAsset==="ETH"?balances.native:balances.usdg):null;
  const switchPayment=(asset:MainnetPaymentAsset)=>{if(working.current||pendingHash.current)return;setPaymentAsset(asset);setAmount("");setPlan(null);setNotice("");};
  const switchSide=(direction:"buy"|"sell")=>{if(disabled||working.current||pendingHash.current)return;setSide(direction);setAmount("");setPlan(null);setNotice("");};
  return <><section id={embedded?"robinhood-swap":undefined} tabIndex={embedded?-1:undefined} className={embedded?`panel corner-panel token-swap${sheetOpen?" is-open":""}`:"panel form-panel token-swap"} aria-label="Swap tokens on Robinhood Chain" role={sheetOpen?"dialog":undefined} aria-modal={sheetOpen||undefined}>
    <div className="corner-head"><span className="corner-label">Swap</span><span className="corner-label is-right">Robinhood Chain</span>{embedded&&<button className="sheet-close" aria-label="Close swap" onClick={onClose}><X size={18}/></button>}</div>
    <TradeWalletNotice network="robinhood"/>
    {!enabled?<p role="status">Mainnet launching is not yet available.</p>:<>
      <TradeFields symbol={record.symbol} paymentSymbol={paymentAsset} side={side} setSide={switchSide} amount={amount} setAmount={value=>{setAmount(value);setPlan(null);setNotice("");}} inputId="rh-swap-amount" disabled={disabled} balanceLabel={balances?side==="sell"?`Balance: ${compact(balances.token)} ${record.symbol}`:paymentBalance===null?"USDG balance unavailable":`Balance: ${compact(paymentBalance,mainnetPaymentDecimals(paymentAsset))} ${paymentAsset}`:session?"Reading wallet balance…":"Connect to see your balance"} output={plan?compact(plan.output,plan.outputDecimals):estimateReady&&indicative.quote?compact(indicative.quote.output,indicative.quote.outputDecimals):"—"} outputHint={plan?"Estimated · final amounts in wallet":!session?"Connect your Robinhood Chain wallet to review a quote":!amount?"Enter an amount to see an estimate":!estimateCurrent||indicative.status==="loading"?"Updating estimate…":indicative.status==="ready"?"Estimated · trading and conversion fees included · network gas extra":indicative.error||"Estimate unavailable"} paymentOptions={<div className="swap-tabs" role="group" aria-label="Payment asset">{(["USDG","ETH"] as const).map(asset=><Button key={asset} aria-pressed={paymentAsset===asset} variant={paymentAsset===asset?"default":"outline"} disabled={disabled} onClick={()=>switchPayment(asset)}>{asset}</Button>)}</div>} onReverse={()=>switchSide(side==="buy"?"sell":"buy")}/>
      <div className="small muted swap-trade-note"><p>Trading fee: 1%, included in the quote.</p><p>{feeExplanation}</p><p>Slippage: 1%. Network gas is paid in ETH. {paymentAsset==="ETH"?"ETH wrapping and unwrapping happen within the trade.":"USDG conversion fees are included in the estimate."}</p></div>
      {notice&&<p className="feedback" role="status">{notice}</p>}
      {pending&&<p className="small muted" role="status">{hash?"Confirmation is checked automatically. You can also check the receipt below.":"Do not repeat the request while its outcome is unknown."}</p>}
      <Button className="primary-action" disabled={!!busy||pending||!!session&&(!market||!amount)} onClick={()=>session?void run("Preparing quote",()=>review()):openSiteWallet("robinhood")}>{busy||(pending?"Transaction pending…":!session?"Connect wallet":`${side==="buy"?"Buy":"Sell"} ${record.symbol}`)}</Button>
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
  <Dialog open={!!plan} onOpenChange={open=>{if(!open&&!busy)setPlan(null);}}><DialogContent className="trade-flow-dialog"><DialogHeader><DialogTitle>Review {side} · {record.symbol}</DialogTitle><DialogDescription>Robinhood Chain · {paymentAsset} payment. Your wallet shows the exact transaction.</DialogDescription></DialogHeader>{plan&&<><dl><div><dt>You pay</dt><dd>{amount} {side==="buy"?paymentAsset:record.symbol}</dd></div><div><dt>Estimated receive</dt><dd>{compact(plan.output,plan.outputDecimals)} {side==="buy"?record.symbol:paymentAsset}</dd></div><div><dt>Minimum receive</dt><dd>{compact(plan.minimum,plan.outputDecimals)} {side==="buy"?record.symbol:paymentAsset}</dd></div><div><dt>Trading fee</dt><dd>1% · included in the quote</dd></div><div><dt>Slippage</dt><dd>1%</dd></div></dl><p className="small muted">{feeExplanation}</p><p className="small muted">{plan.approval?"Step 1: approve only the entered amount. After confirmation, your trade review opens automatically; the trade needs a separate wallet confirmation.":"The quote expires after one minute. Network gas is separate."}</p><Button className="primary-action" disabled={disabled} onClick={()=>void run("Review in wallet",execute)}>{plan.approval?"Approve exact amount":`Confirm ${side} in wallet`}</Button></>}{error&&<p role="alert">{error}</p>}</DialogContent></Dialog>
  {!embedded&&<RobinhoodMainnetHistory record={record} enabled={enabled} refreshKey={historyRevision}/>}</>;
}
