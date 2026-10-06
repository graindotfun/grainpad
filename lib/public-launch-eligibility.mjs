/** Future publication policy only. No journal, signing, RPC, environment or activation path. */
import {PublicKey} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';
import {CONFIRMED_ON_CHAIN,LAUNCH_RECORD_VERSION,LAUNCH_IDENTITY_REVISION,TOKEN_PROGRAM} from './launch-registration.mjs';
import {grainpadPlatformId} from './platform-policy.mjs';
import {QUOTES} from './quote-assets.mjs';
export const PUBLIC_LAUNCH_PUBLICATION_ENABLED=false;
export const PUBLIC_LAUNCH_ELIGIBILITY_REASONS=Object.freeze({
 disabled:'Public launch publication is disabled by the checked-in policy.',
 missingRecord:'A canonical stored registration is required.',
 verification:'Registration must be confirmed on chain.',
 recordVersion:'Registration must use the current record version.',
 identityRevision:'Registration must use the current identity revision.',
 network:'Only the canonical mainnet-beta registration is supported.',
 platform:'Registration must belong to the configured Grainpad platform.',
 mint:'A canonical nonzero mint address is required.',
 requestedMint:'Requested mint must match the registered mint.',
 creator:'A canonical nonzero creator address is required.',
 pool:'A canonical nonzero launch pool address is required.',
 metadataHash:'Registration must bind a lowercase SHA-256 metadata hash.',
 proofSlot:'Registration must have a positive finalized proof slot.',
 quoteMint:'The quote mint must be in the current configured quote set.',
 quoteIdentity:'Quote symbol and decimals must match that configured mint.',
 tokenProgram:'The token program must be supported by canonical registration.',
});
function address(value){try{return typeof value==='string'&&new PublicKey(value).toBase58()===value&&value!==PublicKey.default.toBase58();}catch{return false;}}
/** Pure policy scenario evaluator; this does not activate the production policy.
 * `record` must come from trusted canonical registration storage, never a client claim.
 * Current registration version attests the existing verifier's economics/rules; this
 * evaluator adds no tax/collector/rate policy and cannot replace on-chain verification.
 */
export function evaluatePublicLaunchEligibilityForPolicy(record,{requestedMint,publicEnabled=false}={}){
 const reasons=[],reject=code=>reasons.push({code,message:PUBLIC_LAUNCH_ELIGIBILITY_REASONS[code]});
 if(publicEnabled!==true)reject('disabled');
 if(!record||typeof record!=='object'||Array.isArray(record)){reject('missingRecord');return {eligible:false,canonicalEligible:false,reasons,binding:null,readOnly:true};}
 if(record.verification!==CONFIRMED_ON_CHAIN)reject('verification');
 if(record.recordVersion!==LAUNCH_RECORD_VERSION)reject('recordVersion');
 if(record.identityRevision!==LAUNCH_IDENTITY_REVISION)reject('identityRevision');
 if(record.network!=='mainnet-beta')reject('network');
 if(record.platformId!==grainpadPlatformId().toBase58())reject('platform');
 if(!address(record.mint))reject('mint');
 if(!address(requestedMint)||record.mint!==requestedMint)reject('requestedMint');
 if(!address(record.creator))reject('creator');
 if(!address(record.pool))reject('pool');
 if(typeof record.metadataHash!=='string'||!/^[0-9a-f]{64}$/.test(record.metadataHash))reject('metadataHash');
 if(!Number.isSafeInteger(record.proofSlot)||record.proofSlot<1)reject('proofSlot');
 const quote=Object.values(QUOTES).find(q=>q.mint===record.quoteMint);
 if(!quote)reject('quoteMint');else if(record.quoteAsset!==quote.symbol||record.quoteDecimals!==quote.decimals)reject('quoteIdentity');
 if(![TOKEN_PROGRAM,TOKEN_2022_PROGRAM_ID.toBase58()].includes(record.tokenProgram))reject('tokenProgram');
 const canonicalEligible=reasons.every(r=>r.code==='disabled');
 return {eligible:canonicalEligible&&publicEnabled===true,canonicalEligible,reasons,
  binding:canonicalEligible?{mint:record.mint,creator:record.creator,metadataHash:record.metadataHash,platformId:record.platformId,network:record.network,proofSlot:record.proofSlot,recordVersion:record.recordVersion,identityRevision:record.identityRevision,quoteMint:record.quoteMint}:null,readOnly:true};
}
/** Production-facing entry point has no caller/env/config enable override. */
export function publicLaunchEligibility(record,requestedMint){
 return evaluatePublicLaunchEligibilityForPolicy(record,{requestedMint,publicEnabled:PUBLIC_LAUNCH_PUBLICATION_ENABLED});
}
