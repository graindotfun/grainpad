type CreatorBuyReview={amountIn:string;minOut:string;expectedNetOutputRaw:string;simulatedNetOutputRaw:string;transferFeeRaw:string;totalCurveFeeRaw:string;curvePrincipalRaw:string;balanceBeforeRaw?:string;quoteDecimals:number;tokenDecimals:number;slippageBps:number};

/** Preserve base-unit precision in financial review; never round through Number. */
export function formatLaunchUnits(raw:string,decimals:number){
 const value=BigInt(raw),negative=value<0n,digits=(negative?-value:value).toString().padStart(decimals+1,'0');
 const whole=decimals?digits.slice(0,-decimals):digits,fraction=decimals?digits.slice(-decimals).replace(/0+$/,''):'';
 return `${negative?'-':''}${BigInt(whole).toLocaleString('en-US')}${fraction?'.'+fraction:''}`;
}

export function LaunchCreatorBuyReview({buy,symbol}:{buy:CreatorBuyReview|null|undefined;symbol:string}){
 if(!buy)return null;
 const quote=(raw:string)=>`${formatLaunchUnits(raw,buy.quoteDecimals)} wXMR`,tokens=(raw:string)=>`${formatLaunchUnits(raw,buy.tokenDecimals)} ${symbol}`;
 const facts=[
  ['Total creator buy debit',quote(buy.amountIn)],
  ['To the bonding curve',quote(buy.curvePrincipalRaw)],
  ['Trading fee · included in total',quote(buy.totalCurveFeeRaw)],
  ['Expected tokens after transfer tax',tokens(buy.expectedNetOutputRaw)],
  ['Simulated tokens received',tokens(buy.simulatedNetOutputRaw)],
  ['Minimum tokens received',tokens(buy.minOut)],
  ['Token transfer tax',tokens(buy.transferFeeRaw)],
  ['Creator wXMR balance before',buy.balanceBeforeRaw===undefined?'Unavailable · refresh review':quote(buy.balanceBeforeRaw)],
  ['Creator wXMR balance after buy',buy.balanceBeforeRaw===undefined?'Unavailable · refresh review':quote(String(BigInt(buy.balanceBeforeRaw)-BigInt(buy.amountIn)))],
 ];
 return <section className="setup-note" aria-label="Atomic creator buy review"><h3>Creator buy · part of this launch</h3><dl>{facts.map(([label,value])=><div key={label} style={{minWidth:0,flexWrap:'wrap',gap:'4px 16px'}}><dt>{label}</dt><dd style={{minWidth:0,overflowWrap:'anywhere',fontVariantNumeric:'tabular-nums'}}>{value}</dd></div>)}</dl><p className="small muted">The {buy.slippageBps/100}% slippage limit applies to the minimum received. Creating the token and this purchase settle in one transaction. If either fails, both are rolled back; network fees may still apply. SOL account rent and network fees are shown separately below.</p></section>;
}
