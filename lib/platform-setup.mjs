import {Buffer} from 'buffer';
import {PublicKey,TransactionMessage,VersionedTransaction,ComputeBudgetProgram} from '@solana/web3.js';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import {PLATFORM_SETTINGS,setupSigningEnabled} from './platform-settings.mjs';
import {POLICY,grainpadPlatformId,decodePlatform,assertGrainpadPolicy} from './platform-policy.mjs';
import {LEGACY_PLATFORM_RATE} from './fee-policy.mjs';
import {expectedRuleAccounts,assertRuleAccounts} from './launch-rules.mjs';
import {QUOTES} from './quote-assets.mjs';
import {buildGuardedPlatformInstructions} from './launch-instructions.mjs';

export const SETUP_DEBIT={'1a':5452760,'1b':7860680};
export const SETUP_TOTAL=SETUP_DEBIT['1a']+SETUP_DEBIT['1b'];
export const SETUP_CAP=13500000;
// Measured 1a: 36,669 CU; corrected 1b: 83,646 CU. Keep the reviewed 200k ceiling,
// including margin for wallet-added Lighthouse assertions (163,331 / 116,862 CU).
export const SETUP_COMPUTE_UNITS=200000;
export const SETUP_MICROLAMPORTS=10000;
export function setupAccounts(){return [grainpadPlatformId(),...expectedRuleAccounts(grainpadPlatformId()),new PublicKey(POLICY.cpConfig)];}
export function setupSimulationIndices(step){if(step==='1a')return [0];if(step==='1b')return [0,2,3,5,6];throw Error('Unknown setup step.');}
/** One coherent snapshot; reject unexpected partial states rather than repair silently. */
export function classifySetup(accounts){
 if(accounts.length!==8)throw Error('Incomplete setup snapshot.');
 // Some simulation RPCs represent an absent account as an empty System account.
 accounts=accounts.map(a=>a&&a.lamports===0&&a.data.length===0&&!a.executable&&a.owner.equals(PublicKey.default)?null:a);
 const [platform,...rest]=accounts,globals=[rest[0],rest[3]],children=[rest[1],rest[2],rest[4],rest[5]],cp=rest[6];
 if(!cp?.owner.equals(sdk.CREATE_CPMM_POOL_PROGRAM))throw Error('Unrecognized migration configuration.');
 for(const [i,q] of Object.values(QUOTES).entries()){
  const account=globals[i];if(!account?.owner.equals(sdk.LAUNCHPAD_PROGRAM))throw Error('Unrecognized global configuration.');
  const cfg=sdk.LaunchpadConfig.decode(account.data);
  if(cfg.tradeFeeRate.toString()!=='2500'||cfg.curveType!==0||cfg.mintB.toBase58()!==q.mint)throw Error('Global configuration changed; review required.');
 }
 if(!platform){if(children.some(Boolean))throw Error('Unexpected orphan setup accounts.');return '1a';}
 if(!platform.owner.equals(sdk.LAUNCHPAD_PROGRAM))throw Error('Unexpected platform owner.');
 assertGrainpadPolicy(decodePlatform(platform.data),{platformRate:LEGACY_PLATFORM_RATE}); // superseded legacy path, historical rate
 const cfg=sdk.PlatformConfig.decode(platform.data),text=x=>Buffer.from(x).toString('utf8').replace(/\0+$/,'');
 if(text(cfg.name)!=='Grainpad'||text(cfg.web)!=='https://grainpad.fun'||text(cfg.img)!=='')throw Error('Platform identity differs from the approved setup.');
 if(children.every(x=>!x))return '1b';
 if(children.some(x=>!x))throw Error('Partial allowlist/rule state. Stop for review.');
 assertRuleAccounts(grainpadPlatformId(),rest.slice(0,6));return 'complete';
}
export async function readSetup(connection){
 const keys=setupAccounts();
 const finalized=await connection.getMultipleAccountsInfoAndContext(keys,{commitment:'finalized'});
 const confirmed=await connection.getMultipleAccountsInfoAndContext(keys,{commitment:'confirmed',minContextSlot:finalized.context.slot});
 const state=classifySetup(finalized.value);
 // Do not prepare 1b from an unfinalized 1a, or reuse a step while it is landing.
 if(classifySetup(confirmed.value)!==state)throw Error('Setup is changing on chain. Wait for finality, then refresh.');
 return {state,slot:finalized.context.slot,accounts:finalized.value};
}
export function buildSetupTransaction(step,blockhash){
 const owner=new PublicKey(PLATFORM_SETTINGS.admin);
 const t=new VersionedTransaction(new TransactionMessage({payerKey:owner,recentBlockhash:blockhash,instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:SETUP_COMPUTE_UNITS}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:SETUP_MICROLAMPORTS}),...buildGuardedPlatformInstructions(owner,grainpadPlatformId(),step)]}).compileToV0Message());
 if(t.message.header.numRequiredSignatures!==1||t.serialize().length!==({'1a':467,'1b':1018}[step]))throw Error('Setup signer count or transaction size changed; review required.');
 return t;
}
export function setupBudget(step,debit,after,maxTotal,launchAllowance){
 if(!(step in SETUP_DEBIT)||debit!==SETUP_DEBIT[step])throw Error('Setup cost differs from the reviewed split; stop for review.');
 if(SETUP_TOTAL>Number(maxTotal)||SETUP_TOTAL>SETUP_CAP)throw Error('Combined setup exceeds the approved 0.0135 SOL cap or your limit.');
 const remainingSetup=step==='1a'?SETUP_DEBIT['1b']:0,minimum=remainingSetup+launchAllowance+5000000;
 if(after<minimum)throw Error('NO-GO: remaining setup, separate issuance allowance and 0.005 SOL reserve are not covered.');
 return {remainingSetup,minimum,total:SETUP_TOTAL};
}
export function assertSetupMessage(p){
 if(!['1a','1b'].includes(p.setupStep)||p.owner!==PLATFORM_SETTINGS.admin||p.network!=='mainnet-beta')throw Error('Invalid setup identity or stage.');
 const expected=buildSetupTransaction(p.setupStep,p.blockhash);
 if(!Buffer.from(expected.message.serialize()).equals(Buffer.from(p.transaction.message.serialize())))throw Error('Setup message differs from the reviewed instructions.');
 if(!p.transaction.signatures.every(s=>s.every(x=>x===0)))throw Error('Setup must be unsigned before the owner wallet.');
}
export function assertSetupSigningEnabled(step){if(!setupSigningEnabled(step))throw Error('Legacy setup is SUPERSEDED — DO NOT SIGN (locked by Gate 0). Legacy 1b does not configure holder rewards. Review the rewards transition separately. Token creation remains locked.');}
