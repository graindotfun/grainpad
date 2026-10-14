"use client";

import {useEffect,useRef, useState} from "react";
import {ArrowRight, Loader2} from "lucide-react";
import {SiteHeader} from "@/components/site-header";
import {LaunchNetworkChip} from "@/components/launch-network-chip";
import {readLaunchHandoff,validateLaunchDraftArtwork} from "@/lib/chain/launch-network-handoff.ts";
import {saveMainnetDraft,readMainnetDraft} from "@/lib/chain/robinhood-mainnet-draft.ts";
import {journalCreateProvider,chooseLaunchSubmissionRecord,launchSubmissionLocked,bindLaunchSubmissionRecords,conflictingLaunchSubmissionBindings} from "@/lib/chain/launch-submission-journal.ts";
import {KineticText} from "@/components/kinetic-text";
import {LaunchActionBar, LaunchSteps} from "@/components/launch-steps";
import "@/app/launch-modes.css";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {createRobinhoodLaunchAdapter} from "@/lib/chain/robinhood-adapter.ts";
import {launchNetwork} from "@/lib/chain/networks.ts";
import {
  openCreateWallet,
  readRobinhoodCreateReceipt,
  submitRobinhoodCreate,
  type CreateOutcome,
  type EvmRequest,
  type RobinhoodCreateTransaction,
} from "@/lib/chain/robinhood-create.ts";
import {ROBINHOOD_FACTORY_ADDRESS} from "@/lib/chain/robinhood-factory.ts";
import {ROBINHOOD_CHAIN_TESTNET} from "@/lib/chain/robinhood-testnet.ts";

type Connected = {account: string; provider: EvmRequest};

function newLaunchId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

const testnetDraftKey="grainpad:46630:launch-draft";
const testnetReceiptKey=(account:string)=>"grainpad:46630:create:"+account.toLowerCase();
export function RobinhoodCreate() {
  const networkId="robinhood:testnet" as const;
  const [account, setAccount] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [identityExtras,setIdentityExtras]=useState({description:"",picture:"",pictureName:"",twitter:"",telegram:"",website:""});
  const [launchId, setLaunchId] = useState("");
  const [recoveryHash, setRecoveryHash] = useState("");
  const [busy, setBusy] = useState("");
  const [outcome, setOutcome] = useState<CreateOutcome | null>(null);
  const [registrationError, setRegistrationError] = useState("");
  const [registered, setRegistered] = useState("");
  const [hydrated,setHydrated]=useState(false);
  const [submissionRequested,setSubmissionRequested]=useState(false);
  const [journalConflict,setJournalConflict]=useState(false);
  const submission=useRef(false),working=useRef(false),submittedHash=useRef("");
  const session = useRef<Connected | null>(null);
  const network = launchNetwork(networkId);
  const robinhood = true;
  const factoryReady = ROBINHOOD_FACTORY_ADDRESS != null;
  function identity(){return {name,symbol,...identityExtras};}
  function restoreIdentity(value:Record<string,unknown>){
    if(typeof value.name==="string")setName(value.name);if(typeof value.symbol==="string")setSymbol(value.symbol);
    setIdentityExtras({description:typeof value.description==="string"?value.description:"",picture:typeof value.picture==="string"?value.picture:"",pictureName:typeof value.pictureName==="string"?value.pictureName:"",twitter:typeof value.twitter==="string"?value.twitter:"",telegram:typeof value.telegram==="string"?value.telegram:"",website:typeof value.website==="string"?value.website:""});
  }
  useEffect(()=>{
    let active=true;
    void(async()=>{
      try {
        const query=new URLSearchParams(window.location.search),recover=query.get("recover");
        const saved=await readMainnetDraft(testnetDraftKey).catch(()=>null);
        if(!active)return;
        if(saved)restoreIdentity(saved);
        if(recover&&/^0x[0-9a-f]{64}$/i.test(recover)){
          const hash=recover.toLowerCase();setRecoveryHash(hash);setOutcome({state:"pending",transactionHash:hash,launchId:null,tokenAddress:null,reason:null});
        }else {
          const incoming=await readLaunchHandoff(query.get("draft"),networkId);
          if(!active)return;
          if(incoming)restoreIdentity(incoming);
          else {const prefill=query.get("name");if(prefill)setName(prefill.slice(0,32));}
        }
      }catch{/* Wallet-owned recovery remains available. */}
      finally{if(active)setHydrated(true);}
    })();return()=>{active=false;};
  },[]);
  useEffect(()=>{if(hydrated&&!busy&&!submissionRequested&&!outcome?.transactionHash)void saveMainnetDraft(testnetDraftKey,{name,symbol,...identityExtras}).catch(()=>{});},[hydrated,busy,submissionRequested,outcome?.transactionHash,name,symbol,identityExtras]);

  async function connect() {
    if(working.current||!hydrated)return;
    working.current=true;setBusy("Connecting wallet");
    try {
      const choices = await openCreateWallet("robinhood:testnet");
      if (choices.stack !== "evm") throw new Error("Robinhood create uses the EVM wallet.");
      const choice = choices.providers[0];
      if (!choice) throw new Error("No browser wallet is available.");
      const connected = await choice.connect();
      session.current = connected;
      setAccount(connected.account);
      let local:Record<string,unknown>|null=null;
      try{local=JSON.parse(localStorage.getItem(testnetReceiptKey(connected.account))||"null");}catch{/* IndexedDB remains independently available. */}
      const owned=await readMainnetDraft(testnetReceiptKey(connected.account)).catch(()=>null);
      if(session.current!==connected)throw Error("Wallet changed during launch recovery.");
      const conflict=conflictingLaunchSubmissionBindings(bindLaunchSubmissionRecords(owned,local));
      setJournalConflict(conflict);if(conflict)setRegistrationError("Independent recovery journals refer to different launches. Both are preserved; recover their original transactions before creating again.");
      const record=chooseLaunchSubmissionRecord(owned,local);
      submission.current=launchSubmissionLocked(record);setSubmissionRequested(submission.current);
      const deepHash=new URLSearchParams(window.location.search).get("recover");
      const explicitRecovery=deepHash&&/^0x[0-9a-f]{64}$/i.test(deepHash);
      if(record&&(!explicitRecovery||record.hash===deepHash.toLowerCase())){
        const draft=record.draft as Record<string,unknown>|undefined;
        if(draft)restoreIdentity(draft);
        if(typeof record.id==="string")setLaunchId(record.id);
        if(typeof record.hash==="string"&&/^0x[0-9a-f]{64}$/i.test(record.hash)){
          submittedHash.current=record.hash;setRecoveryHash(record.hash);setOutcome({state:"pending",transactionHash:record.hash,launchId:typeof record.id==="string"?record.id:null,tokenAddress:null,reason:null});
        }else if(submission.current&&!conflict)setRegistrationError("A previous wallet submission may exist. Check wallet activity and recover its hash before creating again.");
      }
    } catch (error) {
      session.current = null;
      setAccount("");
      setOutcome({state: "failure", transactionHash: submittedHash.current||outcome?.transactionHash||null, launchId: launchId || null, tokenAddress: null, reason: error instanceof Error ? error.message : "The wallet did not connect."});
    } finally {
      working.current=false;setBusy("");
    }
  }

  async function create() {
    const current = session.current;
    if (!current||working.current||submission.current||outcome?.transactionHash||!hydrated) return;
    working.current=true;setOutcome(null);
    setBusy("Review the create in your wallet");
    try {
      await validateLaunchDraftArtwork(identityExtras.picture);
      const prepared = await createRobinhoodLaunchAdapter().createToken({name, symbol, launchId});
      const provider=journalCreateProvider(current.provider,{id:launchId,draft:identity()},async record=>{
        submission.current=record.submissionRequested===true;setSubmissionRequested(submission.current);
        if(typeof record.hash==="string"){submittedHash.current=record.hash;setRecoveryHash(record.hash);setOutcome({state:"pending",transactionHash:record.hash,launchId,tokenAddress:null,reason:null});}
        await saveMainnetDraft(testnetReceiptKey(current.account),record);
        localStorage.setItem(testnetReceiptKey(current.account),JSON.stringify({id:launchId,submissionRequested:record.submissionRequested,...(record.hash?{hash:record.hash}:{})}));
      });
      const result = await submitRobinhoodCreate(provider, prepared as RobinhoodCreateTransaction, current.account);
      setOutcome(result.transactionHash||!submittedHash.current?result:{...result,transactionHash:submittedHash.current});
    } catch (error) {
      setOutcome({state: "failure", transactionHash: submittedHash.current||null, launchId, tokenAddress: null, reason: error instanceof Error ? error.message : "The create could not be prepared."});
    } finally {
      working.current=false;setBusy("");
    }
  }

  async function register() {
    if (outcome?.state !== "success" || !outcome.transactionHash) return;
    setBusy("Registering token");
    setRegistrationError("");
    try {
      const response = await fetch("/api/robinhood/register", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({transactionHash: outcome.transactionHash}),
      });
      const body = await response.json() as {error?: string; tokenAddress?: string};
      if (!response.ok || typeof body.tokenAddress !== "string") throw new Error(body.error || "Registration failed.");
      setRegistered(body.tokenAddress);
    } catch (error) {
      setRegistrationError(error instanceof Error ? error.message : "Registration failed.");
    } finally {
      setBusy("");
    }
  }

  async function checkReceipt() {
    const current = session.current;
    if (!current || outcome?.state === "failure" && !outcome.transactionHash) return;
    const hash = outcome?.transactionHash;
    if (!hash) return;
    setBusy("Checking receipt");
    try {
      setOutcome(await readRobinhoodCreateReceipt(current.provider, hash, {launchId: outcome?.launchId ?? launchId, factory: ROBINHOOD_FACTORY_ADDRESS ?? undefined}));
    } catch (error) {
      setOutcome({state: "failure", transactionHash: hash, launchId: outcome?.launchId ?? null, tokenAddress: null, reason: error instanceof Error ? error.message : "The wallet did not return a receipt."});
    } finally {
      setBusy("");
    }
  }

  const hash = outcome?.transactionHash;
  const locked=!!busy||!!hash||submissionRequested||!hydrated;
  const explorer = hash ? `${ROBINHOOD_CHAIN_TESTNET.blockExplorerUrl}/tx/${hash}` : "";

  return <main className="shell">
    <SiteHeader showWallet={false}/>
    <div className="page-heading">
      <div>
        <LaunchNetworkChip networkId={networkId} disabled={!!busy||!hydrated} submitted={!!hash||submissionRequested} identity={identity} onError={setRegistrationError}/>
        <p className="eyebrow">TESTNET LAUNCH / ROBINHOOD CHAIN</p>
        <h1><KineticText>prepare a test token.</KineticText></h1>
      </div>
      <p>Chain id {ROBINHOOD_CHAIN_TESTNET.chainId}. The factory is not deployed from this screen.</p>
    </div>
    <div className="launch-grid">
      <section className="panel form-panel launch-flow">
        <LaunchSteps steps={["Network", "Token details", "Create and register"]} current={!robinhood ? 1 : !account || !outcome ? 2 : 3}/>
        <div className="panel-title"><h2>network</h2></div>
        {robinhood && !factoryReady && <p role="status" className="setup-note">Robinhood Chain testnet create is unavailable. The factory address is not configured.</p>}
        {robinhood && factoryReady && <>
          <p className="setup-note">These contracts are not production-ready. Your wallet signs the factory create. After confirmation, register the token to open its testnet market.</p>
          <label>Name
            <Input aria-label="Token name" value={name} disabled={locked} maxLength={32} onChange={event => {setName(event.target.value); setOutcome(null); setRegistered(""); setRegistrationError("");}}/>
          </label>
          <label>Symbol
            <Input aria-label="Token symbol" value={symbol} disabled={locked} maxLength={10} onChange={event => {setSymbol(event.target.value); setOutcome(null); setRegistered(""); setRegistrationError("");}}/>
          </label>
          <label>Launch id
            <Input aria-label="Launch id" value={launchId} disabled={locked} autoComplete="off" spellCheck={false} onChange={event => {setLaunchId(event.target.value); setOutcome(null); setRegistered(""); setRegistrationError("");}}/>
          </label>
          <div className="launch-secondary-actions"><Button variant="outline" disabled={locked} onClick={() => {setLaunchId(newLaunchId()); setOutcome(null); setRegistered(""); setRegistrationError("");}}>Generate launch id</Button></div>
          {!account
            ? <LaunchActionBar label="Robinhood testnet action"><p className="small muted"><span className="launch-hint-full">Connect a browser wallet on Robinhood Chain testnet.</span><span className="launch-hint-short" aria-hidden="true">Connect a testnet wallet.</span></p><Button className="primary-action" disabled={!!busy||!hydrated} onClick={() => void connect()}>{busy ? <><Loader2 className="spin"/>{busy}</> : <>Connect wallet<ArrowRight/></>}</Button></LaunchActionBar>
            : <>
              <p className="address-line">{account}</p>
              <label>Recover an earlier create transaction
                <Input value={recoveryHash} disabled={!!busy||!hydrated} placeholder="0x transaction hash" onChange={event => setRecoveryHash(event.target.value)}/>
              </label>
              <Button variant="outline" disabled={!!busy || !recoveryHash || !hydrated} onClick={() => {
                const current = session.current;
                if (!current) return;
                setBusy("Recovering receipt"); setRegistered("");
                void readRobinhoodCreateReceipt(current.provider, recoveryHash, {factory: ROBINHOOD_FACTORY_ADDRESS ?? undefined})
                  .then(setOutcome).catch(error => setRegistrationError(error instanceof Error ? error.message : "Receipt unavailable."))
                  .finally(() => setBusy(""));
              }}>Recover receipt</Button>
              <LaunchActionBar label="Robinhood testnet action"><p className="small muted"><span className="launch-hint-full">{outcome?.transactionHash ? "A create transaction already exists for this form. Check or register it below." : "Your wallet shows the factory create before anything is sent."}</span><span className="launch-hint-short" aria-hidden="true">{outcome?.transactionHash ? "Already created · check below." : "Your wallet shows it first."}</span></p><Button className="primary-action" disabled={locked} onClick={() => void create()}>{busy ? <><Loader2 className="spin"/>{busy}</> : <>Create test token<ArrowRight/></>}</Button></LaunchActionBar>
            </>}
        </>}
        {journalConflict&&<p role="alert">Conflicting launch journals are preserved. Verify each original transaction before creating again.</p>}
        {submissionRequested&&!hash&&<p role="alert">A wallet submission may already exist. Recover its hash here before creating again.</p>}
        {outcome && <dl>
          <div><dt>Result</dt><dd>{outcome.state}</dd></div>
          <div><dt>Launch id</dt><dd>{outcome.launchId ?? "—"}</dd></div>
          <div><dt>Transaction</dt><dd>{hash ?? "—"}</dd></div>
          <div><dt>Token address</dt><dd>{outcome.tokenAddress ?? "—"}</dd></div>
        </dl>}
        {outcome?.state === "pending" && <p role="status" className="setup-note">Waiting for the wallet receipt.</p>}
        {outcome?.state === "success" && <p role="status" className="setup-note">The create transaction succeeded.</p>}
        {outcome?.state === "success" && outcome.tokenAddress && !registered && <Button variant="outline" disabled={!!busy||!hydrated} onClick={() => void register()}>Register token</Button>}
        {registrationError && <p role="alert">{registrationError} You can retry registration without creating another token.</p>}
        {registered && <p role="status"><a className="text-link" href={`/network/robinhood/token/${registered}`}>Open the testnet token page</a></p>}
        {outcome?.state === "failure" && <p role="alert" className="feedback error">{outcome.reason}</p>}
        {hash && <div className="receipt">
          <a className="text-link" href={explorer} target="_blank" rel="noreferrer">View transaction</a>
          {outcome?.state === "pending" && <Button variant="outline" disabled={!!busy||!hydrated} onClick={() => void checkReceipt()}>Check receipt</Button>}
        </div>}
      </section>
      <aside className="preview-panel">
        <p className="eyebrow">TESTNET ONLY</p>
        <h2>{network.label}</h2>
        <p className="muted">This form always uses Robinhood Chain testnet. Choose another network above to copy only your token identity into a separate draft.</p>
        <div className="preview-divider"/>
        <p className="muted">A prepared create calls the factory with your name, symbol, and launch id. Chain id {ROBINHOOD_CHAIN_TESTNET.chainId}. No mainnet transaction is built.</p>
      </aside>
    </div>
  </main>;
}
