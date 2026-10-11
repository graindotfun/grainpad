import {PublicKey} from '@solana/web3.js';
import {PLATFORM_SETTINGS} from './platform-settings.mjs';
import {REWARDS_POLICY} from './rewards-policy.mjs';
import {isPreviousOfficialMint} from './previous-official-mints.mjs';
import {REWARDS_SPLIT_V2,splitDeploymentForConfig} from './rewards-split-policy.mjs';

/** Public deployment settings only. No default wallet or economic split is assumed. */
// The split is the approved launch economics (70% holders / 15% GRAIN reserve / 15% Grainpad). The collector (D1)
// is owner-selected (Phantom public address only); the official GRAIN mint is owner-confirmed; operator custody approval remains separate.
// Owner approved the bounded collector policy and live operation on 2 Oct 2026.
// Public issuance and official-token signing retain separate release gates.
export const REWARDS_DEPLOYMENT=Object.freeze({collector:'BxJZSApDy7i4VVAQSRCL5FQJ2RCCP676PUWKYEcY1Z6i',holdersBps:7000,grainBurnBps:1500,grainpadBps:1500,grainpadRecipient:PLATFORM_SETTINGS.revenueRecipient,officialGrainMint:'FCN2KLyUGT9EddKf8MZYjPce8CWxUid7nWpAx9ograin',policyApproved:true});
/** Current published prospective terms; archived source allocations use their own frozen split. */
export const PUBLISHED_REWARDS_DEPLOYMENT=Object.freeze(splitDeploymentForConfig({revenueSplitVersion:REWARDS_SPLIT_V2},REWARDS_DEPLOYMENT));
export function assertRewardsDeployment(deployment=REWARDS_DEPLOYMENT){
 if(deployment.policyApproved!==true)throw Error('The Grainpad rewards policy has not been approved.');
 if(isPreviousOfficialMint(deployment.officialGrainMint))throw Error('Previous official mint is not supported.');
 let collector;try{collector=new PublicKey(deployment.collector);}catch{throw Error('Configure the Grainpad collector and official GRAIN mint.');}
 let grain=null;
 if(deployment.officialGrainMint){try{grain=new PublicKey(deployment.officialGrainMint);}catch{throw Error('Configure the Grainpad collector and official GRAIN mint.');}}
 if(!PublicKey.isOnCurve(collector.toBytes())||collector.equals(PublicKey.default)||String(collector)!==deployment.collector||(grain&&(grain.equals(PublicKey.default)||String(grain)!==deployment.officialGrainMint||String(grain)===REWARDS_POLICY.payoutMint)))throw Error('Invalid rewards deployment identity.');
 const {holdersBps,grainBurnBps}=deployment;
 const grainpadBps=deployment.grainpadBps??0;
 if(!Number.isInteger(grainpadBps)||grainpadBps<0||grainpadBps>10000||(grainpadBps>0&&(deployment.grainpadRecipient!==PLATFORM_SETTINGS.revenueRecipient||deployment.grainpadRecipient===deployment.collector)))throw Error('Platform revenue must use the approved platform fee wallet.');
 if(!Number.isInteger(holdersBps)||!Number.isInteger(grainBurnBps)||holdersBps<=0||grainBurnBps<=0||holdersBps+grainBurnBps+grainpadBps!==10000)throw Error('Approve an explicit holder / GRAIN burn split totaling 100%.');
 return {...deployment,collector,officialGrainMint:grain};
}
