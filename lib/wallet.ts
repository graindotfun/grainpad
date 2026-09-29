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
/** Mobile browsers inject no Solana wallet; these universal links reopen the page in a wallet's in-app browser, which does. */
export function walletBrowseLinks(pageUrl:string){
 const page=new URL(pageUrl);if(page.protocol!=='https:'&&page.hostname!=='localhost')throw Error('Wallet browse links require an HTTPS page.');
 const url=encodeURIComponent(page.toString()),ref=encodeURIComponent(page.origin);
 return [{name:'Phantom',href:`https://phantom.app/ul/browse/${url}?ref=${ref}`},{name:'Solflare',href:`https://solflare.com/ul/v1/browse/${url}?ref=${ref}`}];
}
export function isMobileBrowser(userAgent:string,maxTouchPoints=0){
 return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)||(/Macintosh/.test(userAgent)&&maxTouchPoints>1);
}
