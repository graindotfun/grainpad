/** Read-only rewards setup review. This module never loads a signer or submits. */
import {createHash} from 'node:crypto';
import {Buffer} from 'buffer';
import {PublicKey,TransactionMessage,VersionedTransaction,ComputeBudgetProgram} from '@solana/web3.js';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import {PLATFORM_SETTINGS} from './platform-settings.mjs';
import {POLICY,grainpadPlatformId,decodePlatform,assertGrainpadPolicy} from './platform-policy.mjs';
import {setupAccounts} from './platform-setup.mjs';
import {QUOTES} from './quote-assets.mjs';
import {decodeAllowConfig,launchConstraints,ruleAddresses,rpcAccount} from './launch-rules.mjs';
import {buildRewardsReconfiguration,rewardsRuleConstraints} from './rewards-launch.mjs';

const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const normalize=accounts=>accounts.map(a=>a&&a.lamports===0&&a.data.length===0&&!a.executable&&a.owner.equals(PublicKey.default)?null:a);
const sameConstraints=(group,expected)=>group?.groupId===0&&group.constraints.length===expected.length&&expected.every((c,i)=>{
 const x=group.constraints[i];return x.field===c.field&&x.op===c.op&&x.value.eq(c.value);
});
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function collectorKey(value){
 const key=new PublicKey(value);
 if(key.equals(PublicKey.default)||!PublicKey.isOnCurve(key.toBytes())||String(key)!==String(value))throw Error('An explicit collector signing address is required.');
 return key;
}
export function rewardsSetupFingerprint(accounts){
 return digest(normalize(accounts).map(a=>a?{owner:String(a.owner),data:Buffer.from(a.data).toString('base64'),executable:!!a.executable}:null));
}

/** Accept only the known legacy policy or resumable stages of this exact change. */
export function inspectRewardsSetup(rawAccounts,collectorAddress){
 if(!Array.isArray(rawAccounts)||rawAccounts.length!==8)throw Error('Read all eight setup accounts together.');
 const accounts=normalize(rawAccounts),collector=collectorKey(collectorAddress),platform=grainpadPlatformId();
 const [account,,,,,,,cp]=accounts;
 if(!account?.owner.equals(sdk.LAUNCHPAD_PROGRAM)||account.executable)throw Error('The existing Grainpad PlatformConfig must be finalized first.');
 if(!cp?.owner.equals(sdk.CREATE_CPMM_POOL_PROGRAM)||cp.executable)throw Error('Unrecognized migration configuration.');
 const policy=decodePlatform(account.data),cfg=sdk.PlatformConfig.decode(account.data);
 if(![String(PublicKey.default),String(collector)].includes(policy.transferAuthority))throw Error('An unexpected collector already controls the platform. Stop for review.');
 assertGrainpadPolicy({...policy,transferAuthority:String(PublicKey.default)});
 const text=x=>Buffer.from(x).toString('utf8').replace(/\0+$/,'');
 if(text(cfg.name)!=='Grainpad'||text(cfg.web)!=='https://grainpad.fun'||text(cfg.img)!=='')throw Error('Platform identity differs from the reviewed setup.');
 const rules={},admission={};
 for(const [i,symbol] of ['SOL','wXMR'].entries()){
  const [config,allow,rule]=accounts.slice(1+i*3,4+i*3),a=ruleAddresses(platform,symbol);
  if(!config?.owner.equals(sdk.LAUNCHPAD_PROGRAM)||config.executable)throw Error('Unexpected global configuration owner.');
  const global=sdk.LaunchpadConfig.decode(config.data);
  if(String(global.mintB)!==QUOTES[symbol].mint||global.curveType!==0||global.tradeFeeRate.toString()!==String(POLICY.protocolRate))throw Error('Global launch policy changed.');
  admission[symbol]=!!allow;
  if(allow){
   if(!allow.owner.equals(sdk.LAUNCHPAD_PROGRAM)||allow.executable)throw Error('Unexpected allowlist owner.');
   const decoded=decodeAllowConfig(allow.data);
   if(!decoded.platformId.equals(platform)||!decoded.configId.equals(a.config))throw Error('Allowlist identity mismatch.');
  }
  if(!rule){rules[symbol]='absent';continue;}
  if(!rule.owner.equals(sdk.LAUNCHPAD_PROGRAM)||rule.executable)throw Error('Unexpected rule owner.');
  const decoded=sdk.PlatformCurveRule.decode(rule.data);
  if(!decoded.platformId.equals(platform)||!decoded.configId.equals(a.config))throw Error('Rule identity mismatch.');
  if(decoded.groups.length===0){rules[symbol]='empty';continue;}
  if(decoded.groups.length!==1)throw Error('Unreviewed rule groups.');
  if(sameConstraints(decoded.groups[0],launchConstraints(symbol)))rules[symbol]='legacy';
  else if(symbol==='wXMR'&&sameConstraints(decoded.groups[0],rewardsRuleConstraints()))rules[symbol]='rewards';
  else throw Error('Unreviewed launch constraints.');
 }
 const configured=policy.transferAuthority===String(collector)&&rules.wXMR==='rewards';
 const state=configured&&!admission.SOL&&admission.wXMR?'active':
  admission.SOL||admission.wXMR?'close-admission':configured?'activation-review':'configure';
 return {state,platform:String(platform),collector:String(collector),admission,rules,
  currentCollector:policy.transferAuthority,policy,fingerprint:rewardsSetupFingerprint(accounts)};
}

export async function readRewardsSetup(connection,collector){
 if(await connection.getGenesisHash()!==MAINNET)throw Error('Mainnet is required for this review.');
 const keys=setupAccounts();
 const finalized=await connection.getMultipleAccountsInfoAndContext(keys,{commitment:'finalized'});
 if(!Number.isSafeInteger(finalized.context?.slot)||finalized.context.slot<1)throw Error('Missing finalized setup slot.');
 const state=inspectRewardsSetup(finalized.value,collector);
 const confirmed=await connection.getMultipleAccountsInfoAndContext(keys,{commitment:'confirmed',minContextSlot:finalized.context.slot});
 if(!Number.isSafeInteger(confirmed.context?.slot)||confirmed.context.slot<finalized.context.slot||rewardsSetupFingerprint(confirmed.value)!==state.fingerprint)throw Error('Setup is changing on chain. Wait for finality and review again.');
 return {...state,slot:finalized.context.slot,accounts:normalize(finalized.value)};
}

function compile(instructions,blockhash){
 const transaction=new VersionedTransaction(new TransactionMessage({payerKey:new PublicKey(PLATFORM_SETTINGS.admin),recentBlockhash:blockhash,instructions:[
  ComputeBudgetProgram.setComputeUnitLimit({units:200000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}),...instructions,
 ]}).compileToV0Message());
 if(transaction.message.header.numRequiredSignatures!==1||transaction.serialize().length>1232)throw Error('Setup transaction exceeds the reviewed signer or packet limit.');
 return transaction;
}

/** Only the next phase is prepared. Activation is always a separate, unapproved review. */
export function rewardsSetupTransactions(snapshot,blockhash){
 const current=inspectRewardsSetup(snapshot.accounts,snapshot.collector);
 if(current.fingerprint!==snapshot.fingerprint||current.state!==snapshot.state)throw Error('Setup snapshot changed after review.');
 if(current.state==='active')return [];
 const a=normalize(snapshot.accounts),built=buildRewardsReconfiguration({admin:new PublicKey(PLATFORM_SETTINGS.admin),collector:new PublicKey(current.collector),
  platformAccount:a[0],solAllowAccount:a[2],wxmrAllowAccount:a[5],wxmrRuleAccount:a[6]});
 const configuration=current.rules.wXMR==='rewards'?built.configurationInstructions.slice(0,1):built.configurationInstructions;
 // A prior packet may already have set the collector. Repeating updateAll can
 // consume the entire next packet without advancing rule setup.
 const pendingConfiguration=current.currentCollector===current.collector?configuration.slice(1):configuration;
 const instructions=current.state==='close-admission'?built.closeInstructions:
  current.state==='configure'?pendingConfiguration:built.activationInstructions;
 // Configuration can safely resume one instruction at a time while both quotes
 // are closed. Keep rule replacement in the same transaction whenever it fits.
 const groups=[];let pending=[];
 for(const instruction of instructions){
  try{compile([...pending,instruction],blockhash);pending.push(instruction);}
  catch(error){if(!pending.length)throw error;groups.push(pending);pending=[instruction];compile(pending,blockhash);}
 }
 if(pending.length)groups.push(pending);
 return groups.map(group=>compile(group,blockhash));
}

/** Unsigned simulation of the first transaction only; no fabricated total cost. */
export async function reviewRewardsSetup(connection,{collector,clock=Date.now}){
 const snapshot=await readRewardsSetup(connection,collector);
 const base={schemaVersion:1,network:'mainnet-beta',readOnly:true,signingAuthorized:false,submissionAvailable:false,
  checkedAt:new Date(clock()).toISOString(),slot:snapshot.slot,platform:snapshot.platform,admin:PLATFORM_SETTINGS.admin,
  proposedCollector:snapshot.collector,state:snapshot.state,admission:snapshot.admission,rules:snapshot.rules,
  snapshotHash:snapshot.fingerprint,preservedPolicy:snapshot.policy,
  requirements:['Approve collector, revenue split and holder eligibility','Review official GRAIN purchase route and operator custody',
   'Review this exact setup change separately from legacy 1b','Complete controlled rehearsal and separately approve public creation']};
 if(snapshot.state==='active')return {...base,transactions:[],next:'Verify the operator and release evidence; on-chain admission is not public-site creation approval.'};
 const latest=await connection.getLatestBlockhash({commitment:'confirmed',minContextSlot:snapshot.slot});
 const transactions=rewardsSetupTransactions(snapshot,latest.blockhash),first=transactions[0],keys=setupAccounts();
 const simulationAddresses=[PLATFORM_SETTINGS.admin,...keys.filter(k=>first.message.staticAccountKeys.some(x=>x.equals(k))).map(String)];
 const before=await connection.getBalance(new PublicKey(PLATFORM_SETTINGS.admin),{commitment:'confirmed',minContextSlot:snapshot.slot});
 const fee=await connection.getFeeForMessage(first.message,'confirmed');
 const simulation=await connection.simulateTransaction(first,{sigVerify:false,commitment:'confirmed',minContextSlot:snapshot.slot,
  accounts:{encoding:'base64',addresses:simulationAddresses}});
 if(simulation.value.err)throw Error('Unsigned rewards setup simulation failed. No transaction was sent.');
 if(!Number.isSafeInteger(simulation.context?.slot)||simulation.context.slot<snapshot.slot||!Number.isSafeInteger(fee.context?.slot)||fee.context.slot<snapshot.slot||!Number.isSafeInteger(fee.value)||fee.value<0||!Number.isSafeInteger(before))throw Error('Incomplete simulation or fee evidence.');
 if(simulation.value.accounts?.length!==simulationAddresses.length)throw Error('Incomplete simulated setup accounts.');
 const after=simulation.value.accounts[0]?.lamports;
 if(!Number.isSafeInteger(after)||after<0)throw Error('Unable to measure the simulated owner balance.');
 const post=[...snapshot.accounts];
 simulationAddresses.slice(1).forEach((address,i)=>{post[keys.findIndex(k=>String(k)===address)]=rpcAccount(simulation.value.accounts[i+1]);});
 const verified=inspectRewardsSetup(post,collector);
 const expected=snapshot.state==='close-admission'?['configure','activation-review']:
  snapshot.state==='configure'?(transactions.length===1?['activation-review']:['configure','activation-review']):['active'];
 if(!expected.includes(verified.state)||verified.fingerprint===snapshot.fingerprint)throw Error('Simulation did not reach the expected safe setup state.');
 // Changes between simulation and report generation invalidate the review.
 const fresh=await readRewardsSetup(connection,collector);
 if(fresh.fingerprint!==snapshot.fingerprint)throw Error('Setup changed during simulation. Refresh the review.');
 return {...base,blockhash:latest.blockhash,lastValidBlockHeight:latest.lastValidBlockHeight,
  transactions:transactions.map((tx,index)=>({index,bytes:tx.serialize().length,unsignedBase64:Buffer.from(tx.serialize()).toString('base64'),
   simulated:index===0,requiresFreshReviewBeforeSigning:true})),
  firstTransaction:{simulationSlot:simulation.context.slot,unitsConsumed:simulation.value.unitsConsumed??null,networkFeeLamports:fee.value,
   balanceBeforeLamports:before,balanceAfterLamports:after,netDebitLamports:before-after,postState:verified.state},
  totalCostLamports:null,next:'Review the first transaction only. After each finalized change, generate a new review; later costs and activation are not approved.'};
}
