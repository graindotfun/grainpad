import {grainpetIdentityOf} from "./grainpet-entry.mjs";
import type {SiteWalletConnection} from "@/components/use-site-wallet";
/** Browser side of grainpet sign-in. The wallet signs one short message per session: no transaction, no fee. */
const post=async(path:string,body:unknown)=>{
 const r=await fetch(path,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
 const j=await r.json().catch(()=>({})) as Record<string,unknown>;
 if(!r.ok)throw Error(typeof j.error==="string"?j.error:"Sign-in failed.");
 return j;
};
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const hex=(text:string)=>"0x"+Array.from(new TextEncoder().encode(text),b=>b.toString(16).padStart(2,"0")).join("");
export async function currentSessionIdentity():Promise<string|null>{
 const r=await fetch("/api/grainpet/session",{credentials:"same-origin",cache:"no-store"});
 if(!r.ok)throw Error("Could not check your sign-in.");
 return ((await r.json()) as {identity:string|null}).identity;
}
/** Signs in once for this wallet. Throws if the wallet changed while the prompt was open. */
export async function signInGrainpet(wallet:SiteWalletConnection,stillCurrent:()=>boolean):Promise<string>{
 const mine=grainpetIdentityOf(wallet);if(!mine)throw Error("This wallet network is not supported by grainpet yet.");
 const c=await post("/api/grainpet/challenge",{family:wallet.family,networkId:wallet.networkId,owner:wallet.owner}) as {identity:string;message:string;token:string};
 if(c.identity!==mine)throw Error("Sign-in did not match this wallet.");
 let signature:string;
 if(wallet.family==="solana"){
  const signed=await wallet.wallet.signMessage(new TextEncoder().encode(c.message),"utf8");
  signature=b64(signed instanceof Uint8Array?signed:signed.signature);
 }else{
  const sig=await wallet.session.provider.request({method:"personal_sign",params:[hex(c.message),wallet.owner]});
  if(typeof sig!=="string")throw Error("Wallet returned no signature.");signature=sig;
 }
 if(!stillCurrent())throw Error("Wallet changed. Sign in again.");
 const s=await post("/api/grainpet/session",{token:c.token,signature}) as {identity:string};
 if(s.identity!==mine)throw Error("Sign-in did not match this wallet.");
 return s.identity;
}
