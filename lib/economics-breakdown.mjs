/** The four money flows a trader, holder or creator can confuse, stated from the approved policy only. */
import {FEE_POLICY,LAUNCH_ECONOMICS,feePercent} from './fee-policy.mjs';
const pct=bps=>`${(bps/100).toFixed(1)}%`;
export function economicsBreakdown(){
 const c=FEE_POLICY.curve,t=LAUNCH_ECONOMICS.holderTax,split=LAUNCH_ECONOMICS.holderTaxSplit;
 return [
  {id:'trading-fee',title:'Trading fee',value:feePercent(LAUNCH_ECONOMICS.curveTotal),detail:`On each bonding-curve trade: ${feePercent(c.protocol)} Raydium protocol + ${feePercent(c.platform)} Grainpad + ${feePercent(c.creator)} token creator, taken in the quote asset. After graduation: ${feePercent(FEE_POLICY.cpmm.trade)} CPMM trade fee plus the ${feePercent(FEE_POLICY.cpmm.creator)} creator fee.`},
  {id:'holder-tax',title:'Holder tax',value:`${pct(t.minimumBps)}–${pct(t.maximumBps)}`,detail:`A separate Token-2022 transfer tax the creator sets at launch (${pct(t.stepBps)} steps, default ${pct(t.defaultBps)}). It is withheld in the token on every transfer, including trades. Grainpad receives ${pct(split.grainpadBps)} of it.`},
  {id:'creator-earnings',title:'Creator earnings',value:feePercent(c.creator),detail:`The creator's share of the curve trading fee, then the ${feePercent(FEE_POLICY.cpmm.creator)} CPMM creator fee after graduation. Creators receive no locked LP and none of the holder tax.`},
  {id:'holder-rewards',title:'Holder rewards',value:pct(split.holdersBps),detail:`Of the converted holder tax, ${pct(split.holdersBps)} is paid to holders in wXMR by snapshot, and ${pct(split.grainReserveBps)} is reserved for GRAIN buy-and-burn (held in wXMR until a reviewed GRAIN route exists). Grainpad takes ${pct(split.grainpadBps)}.`},
 ];
}
