/** Shared candidate issuance verification; never signs, activates or changes policy. */
import {PublicKey} from '@solana/web3.js';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import {REWARDS_POLICY} from './rewards-policy.mjs';
import {REWARDS_DEPLOYMENT,assertRewardsDeployment} from './rewards-deployment.mjs';
import {QUOTES} from './quote-assets.mjs';
import {grainpadPlatformId,assertGrainpadPolicy,decodePlatform} from './platform-policy.mjs';
import {decodeAllowConfig,ruleAddresses} from './launch-rules.mjs';
import {rewardsAddresses,rewardsRuleConstraints} from './rewards-launch.mjs';

export function assertRewardsPlatform(account,collector){
 if(!collector||!account?.owner.equals(sdk.LAUNCHPAD_PROGRAM))throw Error('A configured Grainpad rewards collector and platform are required.');
 const p=decodePlatform(account.data);
 if(p.transferAuthority!==String(collector))throw Error('Platform collector differs from the configured Grainpad collector.');
 // Existing fee, founder, LP and restriction policy remains identical. Only the
 // explicitly pinned collector replaces the former absent transfer authority.
 assertGrainpadPolicy({...p,transferAuthority:String(PublicKey.default)});
 return sdk.PlatformConfig.decode(account.data);
}
export function expectedRewardsRuleAccounts(platform){const a=rewardsAddresses(platform);return [a.config,a.allow,a.rule,ruleAddresses(platform,'SOL').allow];}
export function assertRewardsRuleAccounts(platform,accounts){
 if(accounts.length!==4)throw Error('Read the wXMR configuration, allowlist, rule and closed SOL allowlist together.');
 const [config,allow,rule,solAllow]=accounts,a=rewardsAddresses(platform);
 if(solAllow)throw Error('SOL admission must be closed for wXMR-only reward launches.');
 for(const x of [config,allow,rule])if(!x?.owner.equals(sdk.LAUNCHPAD_PROGRAM))throw Error('Rewards configuration or rule unavailable.');
 const cfg=sdk.LaunchpadConfig.decode(config.data),al=decodeAllowConfig(allow.data),r=sdk.PlatformCurveRule.decode(rule.data);
 if(String(cfg.mintB)!==QUOTES.wXMR.mint||cfg.curveType!==0||cfg.tradeFeeRate.toString()!=='2500')throw Error('wXMR global configuration changed.');
 if(!al.platformId.equals(platform)||!al.configId.equals(a.config)||!r.platformId.equals(platform)||!r.configId.equals(a.config))throw Error('Rewards rule identity mismatch.');
 if(r.groups.length!==1)throw Error('Unexpected rewards rule groups.');
 return [0].map(i=>{
  const expected=rewardsRuleConstraints(),group=r.groups.find(g=>g.groupId===i);
  if(!group||group.constraints.length!==expected.length||expected.some((c,j)=>{const x=group.constraints[j];return x.field!==c.field||x.op!==c.op||!x.value.eq(c.value);}))throw Error('Rewards rules differ from the published launch shape.');
  return {symbol:'wXMR',minimumTaxBps:REWARDS_POLICY.minimumTaxBps,maximumTaxBps:REWARDS_POLICY.maximumTaxBps,group:i,config:String(a.config),allowlist:String(a.allow),rule:String(a.rule),constraints:expected.map(c=>({...c,value:c.value.toString()}))};
 });
}
export async function readRewardsIssuanceState(connection,{deployment=REWARDS_DEPLOYMENT}={}){
 const configured=assertRewardsDeployment(deployment),platformId=grainpadPlatformId();
 const read=await connection.getMultipleAccountsInfoAndContext([platformId,...expectedRewardsRuleAccounts(platformId)],{commitment:'finalized'});
 const [account,...rules]=read.value,platform=assertRewardsPlatform(account,configured.collector);
 const verifiedRules=assertRewardsRuleAccounts(platformId,rules),config=sdk.LaunchpadConfig.decode(rules[0].data);
 return {platformId,platform,config,collector:configured.collector,quote:QUOTES.wXMR,slot:read.context.slot,rules:verifiedRules};
}
