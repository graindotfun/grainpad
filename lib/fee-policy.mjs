/** Rates use millionths. Policy values are not evidence of platform activation. */
export const FEE_POLICY = Object.freeze({
 denominator:1_000_000,
 curve:Object.freeze({protocol:2500,platform:2500,creator:2500}),
 cpmm:Object.freeze({trade:2500,creator:10000,protocolShare:120000,fundShare:40000}),
});
export const feePercent = rate => `${rate / (FEE_POLICY.denominator / 100)}%`;
export const CURVE_FEE_DISCLOSURE = `${feePercent(FEE_POLICY.curve.protocol)} protocol + ${feePercent(FEE_POLICY.curve.platform)} Grainpad + ${feePercent(FEE_POLICY.curve.creator)} token creator = ${feePercent(Object.values(FEE_POLICY.curve).reduce((a,b)=>a+b,0))} base curve fee.`;
export const CPMM_FEE_DISCLOSURE = `After graduation, the selected CRRS5 configuration charges ${feePercent(FEE_POLICY.cpmm.trade)} CPMM trade fee plus a separate ${feePercent(FEE_POLICY.cpmm.creator)} creator fee in the quote asset. These replace the curve split. The Fee Key receives LP-fee rights, not the creator fee. Creator fees require an enabled migrated pool; exact amounts depend on trade direction and rounding.`;
