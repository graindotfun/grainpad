import {PublicKey} from '@solana/web3.js';
import {REWARDS_POLICY} from './rewards-policy.mjs';

/** Public deployment settings only. No default wallet or economic split is assumed. */
export const REWARDS_DEPLOYMENT=Object.freeze({collector:null,holdersBps:null,grainBurnBps:null,officialGrainMint:null,policyApproved:false});
export function assertRewardsDeployment(deployment=REWARDS_DEPLOYMENT){
 if(deployment.policyApproved!==true)throw Error('The Grainpad rewards policy has not been approved.');
 let collector,grain;try{collector=new PublicKey(deployment.collector);grain=new PublicKey(deployment.officialGrainMint);}catch{throw Error('Configure the Grainpad collector and official GRAIN mint.');}
 if(!PublicKey.isOnCurve(collector.toBytes())||collector.equals(PublicKey.default)||grain.equals(PublicKey.default)||String(collector)!==deployment.collector||String(grain)!==deployment.officialGrainMint||String(grain)===REWARDS_POLICY.payoutMint)throw Error('Invalid rewards deployment identity.');
 const {holdersBps,grainBurnBps}=deployment;
 if(!Number.isInteger(holdersBps)||!Number.isInteger(grainBurnBps)||holdersBps<=0||grainBurnBps<=0||holdersBps+grainBurnBps!==10000)throw Error('Approve an explicit holder / GRAIN burn split totaling 100%.');
 return {...deployment,collector,officialGrainMint:grain};
}
