import type {Metadata} from 'next';
import {shareProject} from './share-data';
import {SITE} from './site-config';
/** Server metadata for shareable pages. D1 only; a missing or unindexed token gets a generic, non-indexed card. */
const copy={
 token:(n:string,s:string)=>({title:`$${s} · ${n} on grainpad`,description:`Trade $${s}, read its chart and public tape, check what an exit really returns and see who built it. One page, on grainpad.`}),
 receipt:(n:string,s:string)=>({title:`$${s} launch receipt · grainpad`,description:`Launch provenance, creator declarations and every indexed trade for ${n}, with coverage kept visible.`}),
 room:(n:string,s:string)=>({title:`$${s} crew board · grainpad`,description:`Open tasks, budgets and credited work for ${n}. Contribute under your wallet; payments are verified on-chain.`}),
} as const;
export async function tokenMetadata(kind:keyof typeof copy,mint:string):Promise<Metadata>{
 let record=null;try{record=await shareProject(mint);}catch{/* Ledger unavailable: generic card. */}
 if(!record)return {title:'Token · grainpad',robots:{index:false,follow:true}};
 const {title,description}=copy[kind](record.name,record.symbol),path=kind==='token'?`/token/${mint}`:`/token/${mint}/${kind}`,image=`${SITE.origin}/api/og/${kind}/${mint}`;
 return {title,description,alternates:{canonical:path},openGraph:{title,description,type:'website',url:SITE.origin+path,siteName:'grainpad',images:[{url:image,width:1200,height:630,alt:`${record.name} ($${record.symbol}) on grainpad`}]},twitter:{card:'summary_large_image',site:`@${SITE.twitterHandle}`,title,description,images:[image]}};
}
export function walletMetadata(wallet:string):Metadata{
 const short=`${wallet.slice(0,4)}…${wallet.slice(-4)}`,title=`${short} · grainpad profile`,description='Launches, crew contributions and verified payments for this wallet.',image=`${SITE.origin}/api/og/crew/${wallet}`;
 return {title,description,openGraph:{title,description,type:'profile',url:`${SITE.origin}/creator/${wallet}`,images:[{url:image,width:1200,height:630}]},twitter:{card:'summary_large_image',site:`@${SITE.twitterHandle}`,title,description,images:[image]}};
}
