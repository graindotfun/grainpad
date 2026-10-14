"use client";
/* eslint-disable @next/next/no-img-element -- Creator-selected data URLs and immutable artwork are rendered without a proxy. */
import {useEffect, useRef, useState} from "react";
import {ArrowRight, ImagePlus} from "lucide-react";
import {Textarea} from "@/components/ui/textarea";
import {LaunchTokenPreviewCard} from "@/components/launch-token-preview-card";
import {SiteFooter} from "@/components/site-footer";
import "@/app/launch-modes.css";
import "@/app/robinhood-launch.css";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {SiteHeader} from "@/components/site-header";
import {LaunchNetworkChip} from "@/components/launch-network-chip";
import {readLaunchHandoff,validateLaunchDraftArtwork} from "@/lib/chain/launch-network-handoff.ts";
import {journalCreateProvider,chooseLaunchSubmissionRecord,launchSubmissionLocked,bindLaunchSubmissionRecords,conflictingLaunchSubmissionBindings,canClearLaunchSubmission,type LaunchSubmissionBinding} from "@/lib/chain/launch-submission-journal.ts";
import {ROBINHOOD_CHAIN_MAINNET, ROBINHOOD_MAINNET_FACTORY_ADDRESS} from "@/lib/chain/robinhood-mainnet.ts";
import {buildRobinhoodMainnetCreateTransaction, newRobinhoodMainnetLaunchId, readRobinhoodMainnetCreateReceipt, submitRobinhoodMainnetCreate, type MainnetCreateOutcome} from "@/lib/chain/robinhood-mainnet-create.ts";
import {discoverRobinhoodMainnetWallets, watchRobinhoodMainnetWallet, type MainnetWalletSession, type MainnetWalletChoice} from "@/lib/chain/robinhood-mainnet-wallet.ts";

import {saveMainnetDraft,readMainnetDraft} from "@/lib/chain/robinhood-mainnet-draft.ts";
import {assertMainnetDisplayText,canonicalMainnetDisplay, signMainnetDisplay, mainnetDisplayImage} from "@/lib/chain/robinhood-mainnet-display.ts";
import {signMainnetMoneroChallenge} from "@/lib/chain/robinhood-mainnet-monero-authorization.ts";
import {type MainnetLaunchRecord} from "@/lib/chain/robinhood-mainnet-registration.ts";

const draftKey = "grainpad:4663:launch-draft";
const receiptKey = (account: string) => "grainpad:4663:create:" + account;
export function RobinhoodMainnetCreate() {
  const ready = ROBINHOOD_MAINNET_FACTORY_ADDRESS !== null;
  const [wallets, setWallets] = useState<MainnetWalletChoice[]>([]);
  const [selected, setSelected] = useState(0);
  const [connected, setConnected] = useState<MainnetWalletSession | null>(null);
  const current = useRef<MainnetWalletSession | null>(null);
  const [step,setStep] = useState(0);
  const [description,setDescription] = useState("");
  const [picture,setPicture] = useState(""); const [pictureName,setPictureName] = useState("");
  const [twitter,setTwitter] = useState(""); const [telegram,setTelegram] = useState(""); const [website,setWebsite] = useState("");
  const [identitySaved,setIdentitySaved] = useState(false);
  const uploads = useRef(0);
  const draftBinding=useRef("");
  const [hydrated,setHydrated]=useState(false);
  const [imageHydrated,setImageHydrated]=useState(false);
  const [name, setName] = useState(""); const [symbol, setSymbol] = useState("");
  const [id, setId] = useState(""); const [hash, setHash] = useState("");
  const [recovery, setRecovery] = useState("");
  const [outcome, setOutcome] = useState<MainnetCreateOutcome | null>(null);
  const [registered, setRegistered] = useState("");
  const [source, setSource] = useState<MainnetLaunchRecord|null>(null);
  const [monero, setMonero] = useState<{admitted?:boolean;monero?:{status?:string;txHash?:string|null};reason?:string|null}|null>(null);
  const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  const working = useRef(false);
  const [submissionRequested,setSubmissionRequested]=useState(false);
  const submission=useRef(false);
  const originalJournal=useRef<{account:string;bindings:readonly LaunchSubmissionBinding[]}|null>(null);
  const [journalConflict,setJournalConflict]=useState(false);
  const [originalBindings,setOriginalBindings]=useState<readonly LaunchSubmissionBinding[]>([]);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    void discoverRobinhoodMainnetWallets().then(next => {if (active) setWallets(next);});
    return () => {active = false;};
  }, [ready]);
  useEffect(() => {
    if (!connected) return;
    return watchRobinhoodMainnetWallet(connected, next => {
      current.current = next; setConnected(next);
      setRegistered("");setSource(null);setMonero(null);setIdentitySaved(false);
      if(!hash&&!submission.current)setId(next ? newRobinhoodMainnetLaunchId(next.account) : "");
      setError("Wallet changed. Check any submitted transaction before creating again.");
    });
  }, [connected,hash]);
  function draft() {return {name,symbol,description,picture,pictureName,twitter,telegram,website};}
  function restoreDraft(value: Record<string,unknown>) {
    for (const [key,set] of [["name",setName],["symbol",setSymbol],["description",setDescription],["picture",setPicture],["pictureName",setPictureName],["twitter",setTwitter],["telegram",setTelegram],["website",setWebsite]] as const) if(typeof value[key]==="string")set(value[key]);
  }
  useEffect(() => {
    let active=true;
    void (async()=>{
      try {
        const query=new URLSearchParams(window.location.search),recover=query.get("recover");
        const saved=JSON.parse(localStorage.getItem(draftKey)||"null");if(saved)restoreDraft(saved);
        const owned=await readMainnetDraft(draftKey).catch(()=>null);
        if(!active)return;
        if(owned&&uploads.current===0){if(typeof owned.picture==="string")setPicture(owned.picture);if(typeof owned.pictureName==="string")setPictureName(owned.pictureName);}
        if(recover&&/^0x[0-9a-f]{64}$/i.test(recover)){setHash(recover.toLowerCase());setRecovery(recover.toLowerCase());setStep(2);}
        else {
          const incoming=await readLaunchHandoff(query.get("draft"),"robinhood:mainnet");
          if(!active)return;
          if(incoming)restoreDraft(incoming);
          else {const name=query.get("name");if(name)setName(name.slice(0,32));}
        }
      }catch{/* Existing per-account recovery still takes precedence on connect. */}
      finally{if(active){setImageHydrated(true);setHydrated(true);}}
    })();
    return()=>{active=false;};
  },[]);
  useEffect(()=>{if(hydrated&&!hash&&!submissionRequested&&!busy){try{localStorage.setItem(draftKey,JSON.stringify({name,symbol,description,twitter,telegram,website}));}catch{/* Creation checks durable draft storage before requesting a transaction. */}}},[hydrated,hash,submissionRequested,busy,name,symbol,description,picture,pictureName,twitter,telegram,website]);
  useEffect(()=>{if(imageHydrated&&!hash&&!submissionRequested)void saveMainnetDraft(draftKey,{picture,pictureName}).catch(()=>{});},[imageHydrated,hash,submissionRequested,picture,pictureName]);
  async function upload(file?:File) {
    if(!file || busy || hash || submission.current || !hydrated)return;
    const version=++uploads.current;
    await run("Reading image",async()=>{
      if(file.size>2_000_000||!["image/png","image/jpeg","image/webp"].includes(file.type))throw Error("Choose a PNG, JPG or WebP below 2 MB.");
      const bytes=new Uint8Array(await file.arrayBuffer());const {validateImage}=await import("@/lib/image-validation.mjs");validateImage(bytes,file.type);
      const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error("Image could not be read."));reader.readAsDataURL(file);});
      if(version===uploads.current){setPicture(data);setPictureName(file.name);}
    });
  }
  async function run(label: string, job: () => Promise<void>) {
    if (working.current || !hydrated) return;
    working.current = true; setBusy(label); setError("");
    try { await job(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Please retry."); }
    finally { working.current = false; setBusy(""); }
  }
  async function connect() {
    const choices = wallets.length ? wallets : await discoverRobinhoodMainnetWallets(); setWallets(choices);
    const choice = choices[selected]; if (!choice) throw new Error("Install or unlock an EVM browser wallet.");
    const session = await choice.connect(true); current.current = session; setConnected(session);
    setRegistered("");setSource(null);setMonero(null);setIdentitySaved(false);
    setId(newRobinhoodMainnetLaunchId(session.account));
    const savedHash = new URLSearchParams(window.location.search).get("recover");
    if (savedHash && /^0x[0-9a-f]{64}$/i.test(savedHash)){setRecovery(savedHash.toLowerCase());setHash(savedHash.toLowerCase());setStep(2);}
    // Keep a small hash journal plus an independent IndexedDB receipt/draft.
    ++uploads.current;
    let saved:{hash?:string;id?:string;draft?:Record<string,unknown>}|null=null;
    try{saved=JSON.parse(localStorage.getItem(receiptKey(session.account))||"null");}catch{/* IndexedDB recovery remains available. */}
    const owned=await readMainnetDraft(receiptKey(session.account)).catch(()=>null);
    if(current.current!==session)throw Error("Wallet changed while recovering. Reconnect the creator wallet.");
    const bindings=bindLaunchSubmissionRecords(owned,saved);
    originalJournal.current={account:session.account,bindings};setOriginalBindings(bindings);
    const conflict=conflictingLaunchSubmissionBindings(bindings);setJournalConflict(conflict);
    if(conflict)setError("Independent recovery journals refer to different launches. Both are preserved; check their original receipts before starting another launch.");
    const record=chooseLaunchSubmissionRecord(owned,saved);
    submission.current=launchSubmissionLocked(record);setSubmissionRequested(submission.current);
    if(record&&(!savedHash||record.hash===savedHash.toLowerCase())){
      draftBinding.current=(owned?.id===record.id&&owned?.draft||record.draft)?String(record.id??""):"";
      if(submission.current){setStep(2);if(typeof record.id==="string")setId(record.id);if(!conflict&&typeof record.hash!=="string")setError("A previous wallet submission may exist. Check wallet activity and recover its transaction hash before creating again.");}
      if(owned&&owned.id===record.id&&owned.draft&&typeof owned.draft==="object")restoreDraft(owned.draft as Record<string,unknown>);
      else if(record.draft&&typeof record.draft==="object")restoreDraft(record.draft as Record<string,unknown>);
      if(typeof record.hash==="string"&&/^0x[0-9a-f]{64}$/.test(record.hash)){
        draftBinding.current=owned?.id===record.id||record.draft?String(record.id??""):"";
        setStep(2);setHash(record.hash);setRecovery(record.hash);
        if(typeof record.id==="string"&&/^0x[0-9a-f]{64}$/.test(record.id))setId(record.id);
      }
    }
  }

  async function check(transactionHash = hash, launchId: string | null = outcome?.launchId ?? null) {
    const session = current.current; if (!session) throw new Error("Connect your mainnet wallet.");
    const knownOriginal=originalJournal.current?.account===session.account?originalJournal.current.bindings.find(binding=>binding.hash===transactionHash.toLowerCase()):null;
    const result = await readRobinhoodMainnetCreateReceipt(session.provider, transactionHash, knownOriginal?.id??launchId);
    if(transactionHash!==hash){setRegistered("");setSource(null);setMonero(null);setIdentitySaved(false);}
    if(current.current!==session)throw Error("Wallet changed during the receipt check. Recover with the creator wallet.");
    setOutcome(result); setHash(result.transactionHash ?? transactionHash); if (result.launchId) setId(result.launchId);
  }
  async function create() {
    const session = current.current; const factory = ROBINHOOD_MAINNET_FACTORY_ADDRESS;
    if (!session || !factory || hash || submission.current || !hydrated) throw new Error("Connect and check earlier transactions first.");
    assertMainnetDisplayText(name,symbol);
    if (/[\x00-\x1f]/.test(name + symbol)) throw new Error("Token name and symbol must not contain control characters; Monero registration requires canonical text.");
    if(picture&&!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(picture))throw Error("Choose a local token image before creating.");
    await validateLaunchDraftArtwork(picture);
    // Commit the large draft before gas; the transaction journal contains only two short hashes.
    await saveMainnetDraft(receiptKey(session.account),{id,draft:draft(),submissionRequested:false});
    try {localStorage.setItem(receiptKey(session.account),JSON.stringify({id,submissionRequested:false}));}
    catch {throw Error("Browser storage is full. Free space or choose a smaller image before creating.");}
    // Validate all display fields before spending gas, then freeze them with this launch id.
    canonicalMainnetDisplay({schema:"grainpad.rh-display.v1",description,imageHash:null,twitter,telegram,website});
    draftBinding.current=id;
    const tx = buildRobinhoodMainnetCreateTransaction({factory, name, symbol, launchId: id});
    const provider=journalCreateProvider(session.provider,{id,draft:draft()},async record=>{
      submission.current=record.submissionRequested===true;setSubmissionRequested(submission.current);
      const bindings=bindLaunchSubmissionRecords(record);originalJournal.current={account:session.account,bindings};setOriginalBindings(bindings);
      if(typeof record.hash==="string"){setHash(record.hash);setRecovery(record.hash);}
      // Persist before forwarding the wallet send. Preserve the original network's independent journal.
      await saveMainnetDraft(receiptKey(session.account),record);
      localStorage.setItem(receiptKey(session.account),JSON.stringify({id,submissionRequested:record.submissionRequested,...(record.hash?{hash:record.hash}:{})}));
    });
    const sent = await submitRobinhoodMainnetCreate(provider, tx, session.account);
    setHash(sent); setOutcome({state: "pending", transactionHash: sent, launchId: id, tokenAddress: null, reason: null});
    let journalSaved=false;
    try {localStorage.setItem(receiptKey(session.account),JSON.stringify({hash:sent,id,submissionRequested:true}));journalSaved=true;}catch{/* Independent IndexedDB receipt below. */}
    try {await saveMainnetDraft(receiptKey(session.account),{hash:sent,id,draft:draft(),submissionRequested:true});journalSaved=true;}catch{/* The small local journal may still be available. */}
    if(!journalSaved)throw Error("Transaction submitted: "+sent+". Copy this hash before refreshing; browser recovery storage is unavailable.");
    await check(sent, id);
  }
  async function register() {
    if (!hash) throw new Error("A submitted transaction is required.");
    const session=current.current;if(!session)throw Error("Connect the creator wallet.");
    async function send(extra:Record<string,unknown>={}) {
      const response=await fetch("/api/robinhood/mainnet/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({transactionHash:hash,...extra})});
      const body=await response.json() as MainnetLaunchRecord&{error?:string};
      if(!response.ok||!body.tokenAddress)throw Error(body.error??"Registration unavailable. Retry without creating again.");
      if(body.transactionHash!==hash.toLowerCase()||body.factory!==ROBINHOOD_MAINNET_FACTORY_ADDRESS||body.chainId!==4663||body.networkId!=="robinhood:mainnet"||outcome?.state==="success"&&(body.tokenAddress!==outcome.tokenAddress||body.launchId!==outcome.launchId))throw Error("Registration differs from your confirmed launch. Check the saved receipt before signing.");return body;
    }
    let body=await send();
    // Recover existing identity without another signature. Never attach an unrelated browser draft.
    if(body.display){setName(body.name);setSymbol(body.symbol);setDescription(body.display.metadata.description);setPicture(mainnetDisplayImage(body.display.metadata)??"");setTwitter(body.display.metadata.twitter);setTelegram(body.display.metadata.telegram);setWebsite(body.display.metadata.website);}
    else if(draftBinding.current===body.launchId) {
      let imageHash:string|null=null,imageBase64:string|undefined,imageType:string|undefined;
      if(picture){const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(picture);if(!match)throw Error("Choose the token image again before registering.");imageType=match[1];imageBase64=match[2];const bytes=Uint8Array.from(atob(imageBase64),c=>c.charCodeAt(0));imageHash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("");}
      const displayMetadata=canonicalMainnetDisplay({schema:"grainpad.rh-display.v1",description,imageHash,twitter,telegram,website});
      setBusy("Approve your token image and description in your wallet");
      const displaySignature=await signMainnetDisplay(session,body,displayMetadata);
      if(current.current!==session)throw Error("Wallet changed. Recover this launch before retrying.");
      body=await send({displayMetadata,displaySignature,...(imageBase64?{imageBase64,imageType}:{})});
    }else {setName(body.name);setSymbol(body.symbol);setDescription("");setPicture("");setTwitter("");setTelegram("");setWebsite("");}
    setIdentitySaved(true);setRegistered(body.tokenAddress);setSource(body);
    await refreshMonero(body.tokenAddress);
  }
  async function refreshMonero(token = registered) {
    if (!token) throw new Error("Register the finalized create receipt first.");
    const response = await fetch("/api/robinhood/mainnet/provenance?token=" + encodeURIComponent(token),{cache:"no-store"});
    const body = await response.json() as NonNullable<typeof monero> & {error?:string}; if (!response.ok) throw new Error(body.error ?? "Monero verification unavailable. Your create transaction is preserved.");
    setMonero(body);
  }
  async function authorizeMonero(renew = false) {
    const session=current.current;if(!session||!source)throw new Error("Connect the creator wallet and register the receipt first.");
    const challengeResponse=await fetch("/api/robinhood/mainnet/provenance",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:source.tokenAddress,action:renew ? "renew" : "challenge"})});
    const challenge=await challengeResponse.json() as {error?:string};if(!challengeResponse.ok)throw new Error(challenge.error ?? "Monero authorization unavailable.");
    const signature=await signMainnetMoneroChallenge(session,source,challenge);
    if(current.current!==session)throw new Error("Wallet changed. Recover the authorization status before retrying.");
    const response=await fetch("/api/robinhood/mainnet/provenance",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:source.tokenAddress,action:"authorize",signature})});
    const body=await response.json() as {error?:string};if(!response.ok)throw new Error(body.error ?? "Authorization response unavailable. Refresh status; do not create again.");
    await refreshMonero();
  }
  async function newLaunch() {
    const active=current.current;if(!active)return;
    if(!outcome||!(monero?.admitted&&outcome.state==="success"||outcome.finalizedRevert))throw Error("Verify the original submitted launch before starting another launch.");
    let local:Record<string,unknown>|null=null;
    try{local=JSON.parse(localStorage.getItem(receiptKey(active.account))||"null");}catch{throw Error("Original receipt storage cannot be checked. Recover it before starting another launch.");}
    const owned=await readMainnetDraft(receiptKey(active.account));
    const bound=originalJournal.current;
    if(current.current!==active||bound&&bound.account!==active.account)throw Error("Wallet changed. Reconnect the original creator.");
    const bindings=[...(bound?.bindings??[]),...bindLaunchSubmissionRecords(owned,local)];
    if(!canClearLaunchSubmission(bindings,outcome))throw Error("This receipt does not resolve every original submitted launch. Both recovery journals are preserved.");
    await saveMainnetDraft(receiptKey(active.account),{});
    localStorage.removeItem(receiptKey(active.account));
    if(current.current!==active)throw Error("Wallet changed. Reconnect before starting a new launch.");
    originalJournal.current=null;setOriginalBindings([]);setJournalConflict(false);submission.current=false;setSubmissionRequested(false);setHash("");setOutcome(null);setRegistered("");setSource(null);setMonero(null);setRecovery("");setIdentitySaved(false);draftBinding.current="";setName("");setSymbol("");setDescription("");setPicture("");setPictureName("");setTwitter("");setTelegram("");setWebsite("");setStep(0);setId(newRobinhoodMainnetLaunchId(active.account));
  }
  const locked=!!busy||!!hash||submissionRequested||!hydrated;
  const shown=hash||submissionRequested?2:step;
  return <main className="gx gx-create"><SiteHeader showWallet={false}/>
    <div className="gx-wrap gx-create-wrap" id="main-content">
      <div className="gx-create-head"><div><LaunchNetworkChip networkId="robinhood:mainnet" disabled={!!busy||!hydrated} submitted={!!hash||submissionRequested} identity={draft} onError={setError}/><p className="gx-label">regular launch · Robinhood · WETH pair</p><h1 className="gx-display">launch a token<span className="gx-dot">.</span></h1></div><p className="gx-mute">give your idea a name, an image and a story. review the terms, then launch from your own wallet.</p></div>
      <div className="gx-steps" role="group" aria-label="Launch steps">{["idea","identity","on-chain"].map((label,index)=><button key={label} type="button" aria-current={shown===index?"step":undefined} data-done={shown>index||undefined} disabled={locked} onClick={()=>setStep(index)}><b>0{index+1}</b> {label}</button>)}</div>
      <div className="launch-grid"><section className="panel form-panel launch-flow">
        {!ready&&<p role="status">Mainnet launching is not yet available.</p>}
        <div className="gx-step" hidden={shown!==0}><div className="gx-step-title"><p className="gx-label">01 · idea</p><h3>what are we launching?</h3></div>
          <label className="gx-field">name<Input placeholder="give your token a name" value={name} disabled={locked} maxLength={32} onChange={e=>setName(e.target.value)}/></label>
          <label className="gx-field">what is it?<Textarea placeholder="what is this token for?" value={description} disabled={locked} maxLength={1000} onChange={e=>setDescription(e.target.value)}/><span className="gx-count gx-mono gx-mute">{description.length} / 1000</span></label>
          <div className="gx-step-nav"><span className="gx-mono gx-mute">step 1 of 3</span><button type="button" className="gx-pill is-orange" onClick={()=>setStep(1)}>next: identity <ArrowRight size={17}/></button></div>
        </div>
        <div className="gx-step" hidden={shown!==1}><div className="gx-step-title"><p className="gx-label">02 · identity</p><h3>give it a face.</h3></div>
          <label className="gx-field">ticker<Input placeholder="E.G. SEED" value={symbol} disabled={locked} maxLength={10} onChange={e=>setSymbol(e.target.value.toUpperCase())}/></label>
          <label className="upload-label"><ImagePlus size={18}/><span>{picture?pictureName||"Token image selected":"Add token image"}<small>PNG, JPG or WebP · up to 2 MB.</small></span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={locked} onChange={e=>{void upload(e.target.files?.[0]);e.target.value="";}}/></label>
          {picture&&<div className="launch-upload-selected"><img src={picture} alt="Selected token image"/><span>{pictureName||"Token image"}</span><Button variant="outline" disabled={locked} onClick={()=>{++uploads.current;setPicture("");setPictureName("");}}>Remove</Button></div>}
          <details className="launch-fold"><summary>Project links<span className="launch-fold-meta">Optional</span></summary>
            <label>Website<Input type="url" placeholder="https://your-project.com" value={website} disabled={locked} maxLength={300} onChange={e=>setWebsite(e.target.value)}/></label>
            <label>X / Twitter<Input type="url" placeholder="https://x.com/your_project" value={twitter} disabled={locked} maxLength={300} onChange={e=>setTwitter(e.target.value)}/></label>
            <label>Telegram<Input type="url" placeholder="https://t.me/your_project" value={telegram} disabled={locked} maxLength={300} onChange={e=>setTelegram(e.target.value)}/></label>
          </details>
          <div className="gx-step-nav"><button className="gx-ghost" onClick={()=>setStep(0)}>back</button><span className="gx-mono gx-mute">step 2 of 3</span><button className="gx-pill is-orange" onClick={()=>setStep(2)}>next: on-chain <ArrowRight size={17}/></button></div>
        </div>
        <div className="gx-step" hidden={shown!==2}><div className="gx-step-title"><p className="gx-label">03 · on-chain</p><h3>review, then launch.</h3></div>
          <div className="transaction-review"><p className="launch-review-summary">{name||"Your token"} · ${symbol||"—"}</p><dl><div><dt>Network</dt><dd>Robinhood mainnet</dd></div><div><dt>Pair</dt><dd>WETH</dd></div><div><dt>Supply</dt><dd>1 billion · fixed</dd></div><div><dt>Curve fee</dt><dd>1% · 0.35% grainpad / 0.65% creator</dd></div><div><dt>Graduation</dt><dd>4 ETH net → Uniswap</dd></div></dl></div>
          <p className="small muted">Mainnet ETH pays gas. Create the token, approve its image and description with a message, then authorize its Monero launch record. Your wallet shows every request.</p>
          <label>Wallet<select value={selected} disabled={locked||!ready} onChange={e=>{setSelected(Number(e.target.value));current.current=null;setConnected(null);}}>{wallets.map((wallet,index)=><option key={index} value={index}>{wallet.name}</option>)}</select></label>
          <Button variant="outline" disabled={!ready||!!busy||!hydrated} onClick={()=>void run("Connecting",connect)}>{connected?"Change wallet / recover":"Connect wallet"}</Button>
          {connected&&<p className="address-line">{connected.account}</p>}
          {!hash&&!submissionRequested&&<><Button className="primary-action" disabled={!ready||!connected||locked||!name||!symbol} onClick={()=>void run("Review create in your wallet",create)}>Create token <ArrowRight size={17}/></Button><button className="gx-ghost" disabled={!!busy||!hydrated} onClick={()=>setStep(1)}>back to identity</button></>}
          {submissionRequested&&!hash&&<p role="alert">A wallet submission may already exist. Recover its hash below; this launch stays on Robinhood mainnet.</p>}
          {hash&&<section className="receipt" aria-label="Saved launch receipt"><p>Transaction: {outcome?.state??"pending"}</p><p className="address-line">{hash}</p><a href={ROBINHOOD_CHAIN_MAINNET.blockExplorerUrl+"/tx/"+hash} target="_blank" rel="noreferrer">View transaction</a><Button variant="outline" disabled={!!busy||!connected} onClick={()=>void run("Checking receipt",()=>check())}>Check receipt</Button>{outcome?.state==="success"&&<Button disabled={!!busy||!connected} onClick={()=>void run("Saving token identity",register)}>{identitySaved?"Check token registration":"Save identity & register"}</Button>}</section>}
          {registered&&<section className="receipt"><p>Monero registration: {monero?.monero?.status??"awaiting verification"}.</p>
            {!monero?.admitted&&["not-published","challenge"].includes(monero?.monero?.status??"not-published")&&<Button disabled={!!busy||!connected||connected.account!==source?.creator} onClick={()=>void run("Authorize Monero record in your wallet",()=>authorizeMonero())}>Authorize Monero launch record</Button>}
            {monero?.monero?.status==="authorization-expired"&&<Button disabled={!!busy||!connected||connected.account!==source?.creator} onClick={()=>void run("Renew expired creator authorization",()=>authorizeMonero(true))}>Renew expired authorization</Button>}
            <Button variant="outline" disabled={!!busy||!hydrated} onClick={()=>void run("Checking Monero registration",()=>refreshMonero())}>Check Monero registration</Button>
            {monero?.reason&&<p role="status">{monero.reason}</p>}{monero?.monero?.txHash&&<p className="address-line">Monero transaction: {monero.monero.txHash}</p>}{monero?.admitted&&<p><a href={"/network/robinhood/mainnet/token/"+registered}>Open token market</a></p>}
          </section>}
          {(monero?.admitted||outcome?.finalizedRevert)&&connected&&<Button variant="outline" disabled={!!busy||!hydrated||journalConflict||!canClearLaunchSubmission(originalBindings,outcome)} onClick={()=>void run("Preparing a new launch",newLaunch)}>Start a new launch</Button>}
        </div>
        <details className="launch-fold"><summary>Recover an earlier launch</summary><label>Transaction hash<Input value={recovery} disabled={!!busy||!hydrated} placeholder="0x transaction hash" onChange={e=>setRecovery(e.target.value)}/></label><Button variant="outline" disabled={!ready||!connected||!recovery||!!busy||!hydrated} onClick={()=>void run("Checking receipt",()=>check(recovery,null))}>Recover receipt</Button>{!connected&&<Button variant="outline" disabled={!ready||!!busy||!hydrated} onClick={()=>void run("Connecting",connect)}>Connect wallet to recover</Button>}</details>
        {journalConflict&&<p role="alert">Conflicting original launch journals are preserved. Recover and independently verify each original transaction; a different launch cannot clear this submission lock.</p>}
        {busy&&<p role="status">{busy}</p>}{error&&<p className="feedback error" role="alert">{error}</p>}{outcome?.reason&&<p role="alert">{outcome.reason}</p>}
      </section>
      <aside className="preview-panel gx-preview gx-onor" aria-label="Launch preview"><p className="gx-label is-ink">live preview · your token in the making</p><LaunchTokenPreviewCard mode={shown as 0|1|2} networkId="robinhood:mainnet" stageLabel={["idea","identity","on-chain"][shown]} name={name} symbol={symbol} description={description} image={picture}/>
        <details className="gx-preview-terms gx-light"><summary>launch terms &amp; records</summary><dl><div><dt>Network</dt><dd>Robinhood mainnet</dd></div><div><dt>Supply</dt><dd>1 billion</dd></div><div><dt>Curve allocation</dt><dd>Up to 800 million</dd></div><div><dt>Liquidity allocation</dt><dd>Up to 200 million</dd></div><div><dt>Graduation target</dt><dd>4 ETH net</dd></div><div><dt>Migration</dt><dd>Uniswap · locked liquidity</dd></div></dl><p className="small muted">Curve fees: 1% total — 0.35% grainpad, 0.65% creator. The Uniswap pool charges 1%; realized net fees from the locked position are split 35% / 65% in each asset. External liquidity and protocol deductions affect earnings.</p><p className="small muted">At the target, approximately 160 million tokens pair with 4 WETH. The remaining approximately 40 million stay locked in the curve. No further minting, burn or withdrawal function.</p><p className="eyebrow">Monero / launch records</p><p className="small muted">Every launch requires verified registration on Monero before its public grainpad market opens. Trading and balances remain on Robinhood. Images and descriptions are creator-signed metadata stored by grainpad.</p></details>
      </aside></div>
    </div><SiteFooter/>
  </main>;
}
