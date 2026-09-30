import {TOKEN_2022_PROGRAM_ID} from "@solana/spl-token";
import {PublicKey} from "@solana/web3.js";
import {SITE,NETWORKS} from "@/lib/site-config";
import {grainpadPlatformId} from "@/lib/platform-policy";
import {chain} from "@/lib/server-rpc";
import {database,verifyOwner} from "@/lib/server-owner";
import {bucket,fail,limitedJSON,sameOrigin} from "@/lib/server-utils";
import {assertMintSuffix} from "@/lib/vanity-suffix";
import {verifyLaunch} from '@/lib/verify-launch.mjs';
import {readConnection} from '@/lib/server-chain-connection';
import {serverMarket} from '@/lib/server-market';
export const dynamic="force-dynamic";
export async function GET(){try{
 const token=await database().prepare("SELECT mint, pool, token_program, published_at FROM official_token WHERE id=1").first<{mint:string;pool:string;token_program:string;published_at:string}>();
 let lifecycle=null;if(token){try{const market=await serverMarket(token.mint);lifecycle={status:market.route,launchPool:token.pool,cpmmPool:market.route==='cpmm'?market.pool:null,tradingPaused:market.route==='graduating',stale:market.stale};}catch{lifecycle={status:'unavailable',stale:true};}}
 return Response.json({token:token?{...token,...lifecycle}:null,network:"mainnet-beta"},{headers:{"Cache-Control":"no-store"}});
}catch(e){return fail(e,503);}}
export async function POST(request:Request){try{
 sameOrigin(request);const body=await limitedJSON(request,3000);verifyOwner(body.approval,body.signature,"publish-ca");
 const mint=new PublicKey(body.approval.value);if(mint.toBase58()===SITE.projectWallet)throw Error("Use the token mint, not the owner wallet.");
 assertMintSuffix(mint.toBase58());
 const existing=await database().prepare("SELECT mint FROM official_token WHERE id=1").first<{mint:string}>();
 if(existing){if(existing.mint!==mint.toBase58())throw Error("An official token is already published. Replacing it requires a reviewed site update.");return GET();}
 const saved=await bucket().get(`launches/mainnet-beta/${mint.toBase58()}`);
 if(!saved)throw Error("Register the confirmed Grainpad launch in the launch workspace first.");
 const launch=await saved.json<{mint:string;pool:string;creator:string;platformId:string;symbol:string;name:string}>();
 if(launch.creator!==SITE.projectWallet||launch.platformId!==grainpadPlatformId().toBase58()||launch.symbol!==SITE.tokenSymbol||launch.name!==SITE.tokenName)throw Error("This is not the owner's GRAIN launch on Grainpad.");
 if(await chain("mainnet-beta","getGenesisHash")!==NETWORKS["mainnet-beta"].genesis)throw Error("Network mismatch.");
 const verification=await verifyLaunch({connection:readConnection(),platform:grainpadPlatformId().toBase58(),pool:launch.pool,mint:mint.toBase58(),loadAsset:async(uri:string)=>{const hash=new URL(uri).pathname.split('/').pop();const asset=await bucket().get(`assets/${hash}`);if(!asset)throw Error('Immutable metadata asset missing.');return new Uint8Array(await asset.arrayBuffer());}});
 if(verification.status!=='PASS')throw Error(`CA remains unpublished: ${verification.checks.filter((c:{status:string})=>c.status==='FAIL').map((c:{name:string;observed:unknown})=>`${c.name}: ${JSON.stringify(c.observed)}`).join('; ')}`);
 await database().prepare("INSERT INTO official_token (id,mint,pool,token_program,published_at,approval) VALUES (1,?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(mint.toBase58(),launch.pool,TOKEN_2022_PROGRAM_ID.toBase58(),new Date().toISOString(),JSON.stringify({request:body.approval,signature:body.signature,verification})).run();
 const stored=await database().prepare("SELECT mint FROM official_token WHERE id=1").first<{mint:string}>();
 if(stored?.mint!==mint.toBase58())throw Error("Another mint was published. Refresh before proceeding.");
 return GET();
}catch(e){return fail(e);}}
