import './browser-buffer.mjs';
/** Owner-approved SOL launch policy: classic SPL, no transfer tax or holder rewards. Pure checks/build proposals only. */
import * as sdk from '@raydium-io/raydium-sdk-v2';
import {PLATFORM_SETTINGS} from './platform-settings.mjs';
import {POLICY,decodePlatform,assertGrainpadPolicy,grainpadPlatformId} from './platform-policy.mjs';
import {QUOTES} from './quote-assets.mjs';
import {ruleAddresses,launchConstraints,decodeAllowConfig,RULE_GROUP} from './launch-rules.mjs';
export const CLASSIC_SOL_MODE='classic-sol-v1';
export function assertClassicSolRules(platform,accounts){
 if(accounts.length!==3)throw Error('SOL configuration, admission and exact rule must be read together.');
 const [config,allow,rule]=accounts,a=ruleAddresses(platform,'SOL');
 for(const account of accounts)if(!account?.owner.equals(sdk.LAUNCHPAD_PROGRAM))throw Error('SOL launches are not enabled on chain: configuration, admission or rule missing.');
 const c=sdk.LaunchpadConfig.decode(config.data),l=decodeAllowConfig(allow.data),r=sdk.PlatformCurveRule.decode(rule.data),expected=launchConstraints('SOL');
 if(String(c.mintB)!==QUOTES.SOL.mint||c.curveType!==0||c.tradeFeeRate.toString()!==String(POLICY.protocolRate)||!l.platformId.equals(platform)||!l.configId.equals(a.config)||!r.platformId.equals(platform)||!r.configId.equals(a.config))throw Error('SOL launch configuration or identity differs from the approved policy.');
 if(r.groups.length!==1||r.groups[0].groupId!==RULE_GROUP||r.groups[0].constraints.length!==expected.length||expected.some((x,i)=>{const observed=r.groups[0].constraints[i];return observed.field!==x.field||observed.op!==x.op||!observed.value.eq(x.value);}))throw Error('SOL launch rules must enforce classic SPL, no transfer fee, exact supply and graduation shape.');
 return {symbol:'SOL',quoteMint:QUOTES.SOL.mint,decimals:9,config:String(a.config),allowlist:String(a.allow),rule:String(a.rule),group:0,transferTaxBps:0,holderRewards:false,constraints:expected.map(x=>({...x,value:x.value.toString()}))};
}
export async function readClassicSolIssuanceState(connection){
 const platformId=grainpadPlatformId(),a=ruleAddresses(platformId,'SOL');
 const read=await connection.getMultipleAccountsInfoAndContext([platformId,a.config,a.allow,a.rule],{commitment:'finalized'}),[account,...rules]=read.value;
 if(!account?.owner.equals(sdk.LAUNCHPAD_PROGRAM))throw Error('Grainpad platform is unavailable.');
 assertGrainpadPolicy(decodePlatform(account.data));
 const checked=assertClassicSolRules(platformId,rules);
 return {platformId,platform:sdk.PlatformConfig.decode(account.data),config:sdk.LaunchpadConfig.decode(rules[0].data),quote:QUOTES.SOL,slot:read.context.slot,rules:[checked]};
}
/** New narrow unsigned proposal. Never invokes the retired legacy setup or changes the wXMR accounts/fees. */
export function buildClassicSolAdmissionProposal({admin,platformAccount,configAccount,allowAccount,ruleAccount}){
 if(String(admin)!==PLATFORM_SETTINGS.admin)throw Error('Configured founder admin required.');
 const platform=grainpadPlatformId(),a=ruleAddresses(platform,'SOL');
 if(!platformAccount?.owner.equals(sdk.LAUNCHPAD_PROGRAM))throw Error('Grainpad platform unavailable.');
 assertGrainpadPolicy(decodePlatform(platformAccount.data));
 if(!configAccount?.owner.equals(sdk.LAUNCHPAD_PROGRAM))throw Error('SOL global configuration unavailable.');
 const cfg=sdk.LaunchpadConfig.decode(configAccount.data);if(String(cfg.mintB)!==QUOTES.SOL.mint||cfg.curveType!==0||cfg.tradeFeeRate.toString()!==String(POLICY.protocolRate))throw Error('SOL global configuration differs.');
 if(allowAccount){assertClassicSolRules(platform,[configAccount,allowAccount,ruleAccount]);return {instructions:[],alreadyActive:true,platform:String(platform)};}
 const instructions=[];
 if(ruleAccount){if(!ruleAccount.owner.equals(sdk.LAUNCHPAD_PROGRAM))throw Error('Unexpected SOL rule owner.');const r=sdk.PlatformCurveRule.decode(ruleAccount.data);if(!r.platformId.equals(platform)||!r.configId.equals(a.config)||r.groups.some(g=>g.groupId!==RULE_GROUP))throw Error('Unexpected SOL rule identity or extra groups.');}
 else instructions.push(sdk.createPlatformCurveRuleIns(sdk.LAUNCHPAD_PROGRAM,admin,platform,a.config,a.rule));
 instructions.push(sdk.updatePlatformCurveRuleIns(sdk.LAUNCHPAD_PROGRAM,admin,platform,a.config,a.rule,RULE_GROUP,launchConstraints('SOL')));
 // Activate only after constraints are established in the same atomic transaction.
 instructions.push(sdk.createPlatformAllowConfigIns(sdk.LAUNCHPAD_PROGRAM,admin,platform,a.config,a.allow));
 return {instructions,alreadyActive:false,platform:String(platform),changes:['SOL classic rule','SOL admission only'],wxmrChanged:false,feesChanged:false};
}
