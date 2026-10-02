import {PublicKey} from '@solana/web3.js';
import {PLATFORM_SETTINGS} from './platform-settings.mjs';
import {REWARDS_POLICY} from './rewards-policy.mjs';

/** Public deployment settings only. No default wallet or economic split is assumed. */
// The split is the approved launch economics (70% holders / 15% GRAIN reserve / 15% Grainpad). The collector (D1)
// is owner-selected (Phantom public address only); the official GRAIN mint is owner-confirmed; operator custody approval remains separate.
// No private key was exported or server signer authorized. Policy stays unapproved.
export const REWARDS_DEPLOYMENT=Object.freeze({collector:'BxJZSApDy7i4VVAQSRCL5FQJ2RCCP676PUWKYEcY1Z6i',holdersBps:7000,grainBurnBps:1500,grainpadBps:1500,grainpadRecipient:PLATFORM_SETTINGS.feeWallet,officialGrainMint:'Db91fm8AxxfoFySAp6Jg3KVcfZHUTAR7bJDJb5WLMgrn',policyApproved:false});
export function assertRewardsDeployment(deployment=REWARDS_DEPLOYMENT){
 if(deployment.policyApproved!==true)throw Error('The Grainpad rewards policy has not been approved.');
 let collector,grain;try{collector=new PublicKey(deployment.collector);grain=new PublicKey(deployment.officialGrainMint);}catch{throw Error('Configure the Grainpad collector and official GRAIN mint.');}
 if(!PublicKey.isOnCurve(collector.toBytes())||collector.equals(PublicKey.default)||grain.equals(PublicKey.default)||String(collector)!==deployment.collector||String(grain)!==deployment.officialGrainMint||String(grain)===REWARDS_POLICY.payoutMint)throw Error('Invalid rewards deployment identity.');
 const {holdersBps,grainBurnBps}=deployment;
 const grainpadBps=deployment.grainpadBps??0;
 if(!Number.isInteger(grainpadBps)||grainpadBps<0||grainpadBps>10000||(grainpadBps>0&&(deployment.grainpadRecipient!==PLATFORM_SETTINGS.feeWallet||deployment.grainpadRecipient===deployment.collector)))throw Error('Platform revenue must use the approved platform fee wallet.');
 if(!Number.isInteger(holdersBps)||!Number.isInteger(grainBurnBps)||holdersBps<=0||grainBurnBps<=0||holdersBps+grainBurnBps+grainpadBps!==10000)throw Error('Approve an explicit holder / GRAIN burn split totaling 100%.');
 return {...deployment,collector,officialGrainMint:grain};
}
