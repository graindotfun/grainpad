'use client';
import {useCallback,useEffect,useState} from 'react';
import {discoverEvmProviders} from '@/lib/chain/evm-wallet.ts';
type Proof={status:string;verified:boolean;confirmations:number;txHash:string|null;manifestHash?:string;notice:string};
export function RobinhoodProvenance({tokenAddress,creator}:{tokenAddress:string;creator:string}){
 const [proof,setProof]=useState<Proof|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{const r=await fetch('/api/robinhood/provenance?token='+tokenAddress,{cache:'no-store'});const j=await r.json() as {error?:string;monero:Proof};if(!r.ok)throw Error(j.error??'Proof unavailable.');setProof(j.monero);},[tokenAddress]);
 useEffect(()=>{let live=true;const check=()=>{if(live)refresh().catch(()=>{if(live)setProof(null);});};check();const timer=setInterval(check,60000);return()=>{live=false;clearInterval(timer);};},[refresh]);
 async function authorize(){if(busy)return;setBusy(true);setError('');try{
  const choices=await discoverEvmProviders();if(!choices[0])throw Error('Unlock an EVM browser wallet.');const wallet=await choices[0].connect(false);
  if(wallet.account.toLowerCase()!==creator.toLowerCase())throw Error('Connect the wallet that created this token.');
  const call=async(body:object)=>{const r=await fetch('/api/robinhood/provenance',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:tokenAddress,...body})});const j=await r.json() as {error?:string;typedData:object};if(!r.ok)throw Error(j.error??'Authorization unavailable.');return j;};
  const c=await call({action:'challenge'});
  const chain=await wallet.provider.request({method:'eth_chainId',params:[]});if(chain!=='0xb626')throw Error('Select Robinhood Chain testnet.');
  const accounts=await wallet.provider.request({method:'eth_accounts',params:[]});if(!Array.isArray(accounts)||accounts[0]?.toLowerCase()!==creator.toLowerCase())throw Error('Creator wallet changed.');
  const signature=await wallet.provider.request({method:'eth_signTypedData_v4',params:[creator,JSON.stringify(c.typedData)]});if(typeof signature!=='string')throw Error('Wallet did not return an authorization.');
  await call({action:'authorize',signature});await refresh();
 }catch(e){setError(e instanceof Error?e.message:'Authorization failed.');}finally{setBusy(false);}}
 return <section className="panel"><h2>launch proof on Monero</h2>
  <p>{proof?.notice??'Current Monero verification is unavailable.'}</p>
  <p>The token, trading and balances remain on Robinhood Chain testnet. This public proof does not make trades private.</p>
  {proof&&<p>{proof.verified?'Verified':proof.status} · {proof.confirmations} confirmations</p>}
  {proof?.txHash&&<p><a href={'https://xmrchain.net/tx/'+proof.txHash} target="_blank" rel="noreferrer">View Monero transaction</a></p>}
  <p><a href={'/api/robinhood/provenance?token='+tokenAddress}>Download public receipt and proof</a></p>
  {proof&&['not-published','challenge'].includes(proof.status)&&<><p>The creator signs permission to publish this launch proof. This authorization does not transfer tokens or grant spending access.</p><button type="button" disabled={busy} onClick={authorize}>{busy?'Waiting for creator approval…':'Authorize launch proof'}</button></>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
