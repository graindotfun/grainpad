import {assertProtectedExecutable} from './protected-launch-deployment.mjs';
import {bucket} from '@/lib/server-utils';
import {readConnection} from '@/lib/server-chain-connection';
import {assertProtectedExecution} from './protected-launch-readiness.mjs';
import {readProtectedState} from './protected-launch-state.mjs';
import {protectedRegistrationIdentity} from './protected-launch-registration.mjs';
/** Revalidation uses only finalized, read-only chain evidence. No transaction
 * preparation or submission modules enter ordinary launch registration. */
export async function readProtectedRegistration(mint:string){
 const object=await bucket().get(`protected/mints/${mint}`);if(!object)return null;
 const pins=assertProtectedExecution(),saved=await object.json<{creator:string;nonce:string;programId:string}>();if(saved.programId!==pins.programId)throw Error('Protected deployment changed.');
 const connection=readConnection();await assertProtectedExecutable(connection,pins,'finalized');
 const snapshot=await readProtectedState(connection,{creator:saved.creator,nonce:saved.nonce,programId:pins.programId,commitment:'finalized'});
 return protectedRegistrationIdentity(snapshot,{mint,programId:pins.programId});
}
