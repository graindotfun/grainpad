import {PublicKey} from '@solana/web3.js';
import {PROTECTED_LOCAL_PROGRAM,PROTECTED_PROGRAM_PUBLIC_EXECUTION} from './protected-launch-program.mjs';
/** A deployment must pin its public address AND reviewed executable digest.
 * Runtime variables alone cannot activate an unreviewed financial release. */
export const PROTECTED_DEPLOYMENT=Object.freeze({programId:null,executableSha256:null,reviewed:false,usdcSolPool:null,lookupTable:null});
export function protectedAvailability(){
 const enabled=PROTECTED_PROGRAM_PUBLIC_EXECUTION&&PROTECTED_DEPLOYMENT.reviewed&&Boolean(PROTECTED_DEPLOYMENT.programId&&PROTECTED_DEPLOYMENT.executableSha256);
 return {enabled,programId:enabled?PROTECTED_DEPLOYMENT.programId:null,reason:enabled?null:'Protected Launch is awaiting its verified program deployment. You can review a draft; deposits are not open.',assets:['wXMR','SOL','USDC']};
}
export function assertProtectedExecution(){
 const ready=protectedAvailability();if(!ready.enabled)throw Error(ready.reason);
 if(new PublicKey(ready.programId).toBase58()!==ready.programId||ready.programId===PROTECTED_LOCAL_PROGRAM||!/^[a-f0-9]{64}$/.test(PROTECTED_DEPLOYMENT.executableSha256||''))throw Error('Protected Launch deployment identity is invalid.');
 return PROTECTED_DEPLOYMENT;
}
