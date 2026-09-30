import {PublicKey} from '@solana/web3.js';
import {readConnection} from '@/lib/server-chain-connection';
import {grainpadPlatformId} from '@/lib/platform-policy';
import {getLaunchProof} from '@/lib/launch-proof.mjs';
import {database} from '@/lib/server-owner';
import {sharedMarketCache} from '@/lib/server-cache';
import {isOwnPlatform} from '@/lib/launch-identity.mjs';
import {bucket,fail} from '@/lib/server-utils';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{mint:string}>}){try{
 const mint=new PublicKey((await params).mint),platform=grainpadPlatformId();
 const object=await bucket().get(`launches/mainnet-beta/${mint}`),indexed=object?null:await database().prepare('SELECT record FROM launch_index WHERE network=? AND platform_id=? AND mint=?').bind('mainnet-beta',String(platform),String(mint)).first<{record:string}>(),record=object?await object.json<{mint:string;platformId:string;verification:string}>():indexed?JSON.parse(indexed.record):null;
 if(!record||record.mint!==String(mint)||record.verification!=='confirmed-on-chain'||!isOwnPlatform(record.platformId,String(platform)))throw Error('This token is not a registered Grainpad launch.');
 const result=await sharedMarketCache(database(),`proof:v3:${platform}:${mint}`,()=>getLaunchProof(readConnection(),mint,platform),{ttl:30_000,maxStale:300_000});
 return Response.json({...result.data,stale:result.stale,...(result.stale?{status:'FAIL',notice:'Proof data is stale. Current launch rules cannot be verified. '+result.data.notice}:{})},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e,400);}}
