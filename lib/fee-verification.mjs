import * as sdk from '@raydium-io/raydium-sdk-v2';
import {FEE_POLICY} from './fee-policy.mjs';
/** Account order: Grainpad platform, SOL GlobalConfig, wXMR GlobalConfig, CRRS5. */
export function decodeFeeSnapshot(accounts) {
 if(accounts.length!==4)throw Error('Four fee accounts required.');
 const [platform,...rest]=accounts;
 for(const [index,a] of accounts.entries()) {
  if(index===0&&!a)continue;
  const expected=index===3?sdk.CREATE_CPMM_POOL_PROGRAM:sdk.LAUNCHPAD_PROGRAM;
  if(!a||a.owner!==expected.toBase58())throw Error('Fee account missing or incorrect owner.');
 }
 const decode=(layout,a)=>layout.decode(Buffer.from(a.data,'base64'));
 const globals=rest.slice(0,2).map(a=>decode(sdk.LaunchpadConfig,a));
 const p=platform?decode(sdk.PlatformConfig,platform):null,c=decode(sdk.CpmmConfigInfoLayout,rest[2]);
 const curveProtocol=globals.map(x=>Number(x.tradeFeeRate.toString()));
 const cpmm={trade:Number(c.tradeFeeRate.toString()),creator:Number(c.creatorFeeRate.toString()),protocolShare:Number(c.protocolFeeRate.toString()),fundShare:Number(c.fundFeeRate.toString())};
 const platformFees=p?{platform:Number(p.feeRate.toString()),creator:Number(p.creatorFeeRate.toString())}:null;
 const protocolMatches=curveProtocol.every(v=>v===FEE_POLICY.curve.protocol);
 const cpmmMatches=Object.entries(FEE_POLICY.cpmm).every(([key,value])=>cpmm[key]===value);
 const platformMatches=!!platformFees&&platformFees.platform===FEE_POLICY.curve.platform&&platformFees.creator===FEE_POLICY.curve.creator;
 return {denominator:FEE_POLICY.denominator,curveProtocol,platformExists:!!p,platformFees,proposedCurve:FEE_POLICY.curve,cpmm,protocolMatches,platformMatches,cpmmMatches,status:!protocolMatches||!cpmmMatches||(p&&!platformMatches)?'FAIL':p?'FEES_MATCH':'PENDING_PLATFORM'};
}
