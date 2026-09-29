import {PublicKey} from '@solana/web3.js';
import {database} from './server-owner';
import {grainpadPlatformId} from './platform-policy';
export type ProjectRecord={mint:string;creator:string;platformId:string;name:string;symbol:string;image:string;quoteAsset:string;pool:string;createdAt:string;verification:string;network:string;uri?:string;description?:string};
export async function registeredProject(address:string):Promise<ProjectRecord>{
 const mint=new PublicKey(address).toBase58(),platform=grainpadPlatformId().toBase58();
 const row=await database().prepare('SELECT record FROM launch_index WHERE network=? AND platform_id=? AND mint=?').bind('mainnet-beta',platform,mint).first<{record:string}>();
 if(!row)throw Error('This token is not a registered Grainpad launch.');
 const record=JSON.parse(row.record) as ProjectRecord;
 if(record.mint!==mint||record.platformId!==platform||record.verification!=='confirmed-on-chain'||record.network!=='mainnet-beta')throw Error('Launch identity could not be verified.');
 return record;
}
