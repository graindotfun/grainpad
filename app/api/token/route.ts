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
import {readOfficialLaunchReservation} from '@/lib/official-launch-reservation.mjs';
import {readOfficialGenerationIdentity} from '@/lib/official-launch-identity.mjs';
import {OFFICIAL_LAUNCH_CREATOR,OFFICIAL_LAUNCH_PINS} from '@/lib/official-launch-policy.mjs';
import {LAUNCH_EXPECTED} from '@/lib/verify-launch.mjs';
import {isPreviousOfficialMint} from '@/lib/previous-official-mints.mjs';
export const dynamic="force-dynamic";
export async function GET(){try{
 const stored=await database().prepare("SELECT generation, mint, pool, token_program, published_at FROM official_token WHERE id=1 AND generation=2").first<{generation:number;mint:string;pool:string;token_program:string;published_at:string}>();
 const token=stored?.generation===2&&!isPreviousOfficialMint(stored.mint)?stored:null;
 let lifecycle=null;if(token){try{const market=await serverMarket(token.mint);lifecycle={status:market.route,launchPool:token.pool,cpmmPool:market.route==='cpmm'?market.pool:null,tradingPaused:market.route==='graduating',stale:market.stale};}catch{lifecycle={status:'unavailable',stale:true};}}
 return Response.json({generation:2,token:token?{...token,...lifecycle}:null,network:"mainnet-beta"},{headers:{"Cache-Control":"no-store"}});
}catch(e){return fail(e,503);}}
export async function POST(request:Request){try{
 sameOrigin(request);const body=await limitedJSON(request,3000);verifyOwner(body.approval,body.signature,"publish-ca");
 const mint=new PublicKey(body.approval.value);if(mint.toBase58()===SITE.projectWallet||mint.toBase58()===OFFICIAL_LAUNCH_CREATOR)throw Error("Use the token mint, not the owner wallet.");
 assertMintSuffix(mint.toBase58());
 const reservation=await readOfficialLaunchReservation(database());
 if(isPreviousOfficialMint(mint.toBase58())||!reservation||reservation.state!=='registered'||!reservation.signature||reservation.mint!==mint.toBase58()||reservation.creator!==OFFICIAL_LAUNCH_CREATOR||!reservation.metadata_hash)throw Error("CA publication requires the exact registered official launch reservation.");
 const identity=await readOfficialGenerationIdentity(database());
 if(!identity||identity.mint!==reservation.mint||identity.metadata_hash!==reservation.metadata_hash)throw Error("CA publication requires the registered official generation identity.");
 const existing=await database().prepare("SELECT mint FROM official_token WHERE id=1 AND generation=2").first<{mint:string}>();
 if(existing){if(existing.mint!==mint.toBase58())throw Error("An official token is already published. Replacing it requires a reviewed site update.");return GET();}
 const indexed=await database().prepare('SELECT record FROM launch_index WHERE network=? AND platform_id=? AND mint=?').bind('mainnet-beta',grainpadPlatformId().toBase58(),mint.toBase58()).first<{record:string}>();
 const saved=indexed?{json:async<T>()=>JSON.parse(indexed.record) as T}:await bucket().get(`launches/mainnet-beta/${mint.toBase58()}`);
 if(!saved)throw Error("Register the confirmed Grainpad launch in the launch workspace first.");
 const launch=await saved.json<{mint:string;pool:string;creator:string;platformId:string;symbol:string;name:string}>();
 if(launch.creator!==OFFICIAL_LAUNCH_CREATOR||launch.platformId!==grainpadPlatformId().toBase58()||launch.symbol!==SITE.tokenSymbol||launch.name!==SITE.tokenName)throw Error("This is not the owner's GRAIN launch on Grainpad.");
 if(await chain("mainnet-beta","getGenesisHash")!==NETWORKS["mainnet-beta"].genesis)throw Error("Network mismatch.");
 const verification=await verifyLaunch({connection:readConnection(),platform:grainpadPlatformId().toBase58(),pool:launch.pool,mint:mint.toBase58(),creationSignature:reservation.signature,expected:{...LAUNCH_EXPECTED,officialMint:mint.toBase58(),metadataHash:reservation.metadata_hash,taxBps:OFFICIAL_LAUNCH_PINS.taxBps},loadAsset:async(uri:string)=>{const hash=new URL(uri).pathname.split('/').pop();const asset=await bucket().get(`assets/${hash}`);if(!asset)throw Error('Metadata asset missing.');return new Uint8Array(await asset.arrayBuffer());}});
 if(verification.checks.find((check:{name:string;observed?:{signature?:string}})=>check.name==='T0-creation-declared-creator-buy')?.observed?.signature!==reservation.signature)throw Error('Verified creation does not match the stored official launch signature.');
 if(verification.status!=='PASS')throw Error(`CA remains unpublished: ${verification.checks.filter((c:{status:string})=>c.status==='FAIL').map((c:{name:string;observed:unknown})=>`${c.name}: ${JSON.stringify(c.observed)}`).join('; ')}`);
 await database().prepare("INSERT INTO official_token (id,generation,mint,pool,token_program,published_at,approval) VALUES (1,2,?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(mint.toBase58(),launch.pool,TOKEN_2022_PROGRAM_ID.toBase58(),new Date().toISOString(),JSON.stringify({request:body.approval,signature:body.signature,verification})).run();
 const published=await database().prepare("SELECT mint FROM official_token WHERE id=1 AND generation=2").first<{mint:string}>();
 if(published?.mint!==mint.toBase58())throw Error("Another mint was published. Refresh before proceeding.");
 return GET();
}catch(e){return fail(e);}}
