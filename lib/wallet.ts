import type {PublicKey,VersionedTransaction} from '@solana/web3.js';
export type Wallet={publicKey:PublicKey|null;connect:()=>Promise<unknown>;disconnect?:()=>Promise<void>;signMessage:(m:Uint8Array,encoding?:string)=>Promise<{signature:Uint8Array}|Uint8Array>;signTransaction:(t:VersionedTransaction)=>Promise<VersionedTransaction>;on?:(event:string,handler:()=>void)=>void;removeListener?:(event:string,handler:()=>void)=>void};
export function walletProviders():{name:string;wallet:Wallet}[]{
 const w=window as unknown as {phantom?:{solana?:Wallet};solflare?:Wallet;solana?:Wallet};
 const list:{name:string;wallet:Wallet}[]=[];
 if(w.phantom?.solana)list.push({name:'Phantom',wallet:w.phantom.solana});
 if(w.solflare)list.push({name:'Solflare',wallet:w.solflare});
 if(w.solana&&!list.some(p=>p.wallet===w.solana))list.push({name:'Browser wallet',wallet:w.solana});
 return list;
}
