type CreatorBuyReview={quote?:string;amountIn:string;minOut:string;expectedNetOutputRaw:string;simulatedNetOutputRaw:string;transferFeeRaw:string;totalCurveFeeRaw:string;curvePrincipalRaw:string;balanceBeforeRaw?:string;quoteDecimals:number;tokenDecimals:number;slippageBps:number;quoteExpiresAt?:number;wxmrQuotedRaw?:string;launchDebitLamports?:string;wxmrBeforeRaw?:string|null;wsolBeforeRaw?:string|null;wxmrExists?:boolean;wsolExists?:boolean;tickArrays?:number};

/** Preserve base-unit precision in financial review; never round through Number. */
export function formatLaunchUnits(raw:string,decimals:number){
 const value=BigInt(raw),negative=value<0n,digits=(negative?-value:value).toString().padStart(decimals+1,'0');
 const whole=decimals?digits.slice(0,-decimals):digits,fraction=decimals?digits.slice(-decimals).replace(/0+$/,''):'';
 return `${negative?'-':''}${BigInt(whole).toLocaleString('en-US')}${fraction?'.'+fraction:''}`;
}

export function LaunchCreatorBuyReview({buy,symbol}:{buy:CreatorBuyReview|null|undefined;symbol:string}){
 if(!buy)return null;
 const sol=buy.quote==='SOL';
 const wxmr=(raw:string)=>`${formatLaunchUnits(raw,12)} wXMR`,lamports=(raw:string)=>`${formatLaunchUnits(raw,9)} SOL`,tokens=(raw:string)=>`${formatLaunchUnits(raw,buy.tokenDecimals)} ${symbol}`;
 const quote=sol?lamports:(raw:string)=>`${formatLaunchUnits(raw,buy.quoteDecimals)} wXMR`;
 const unavailable='Unavailable · refresh review';
 const facts=sol?[
  ['Pay with','SOL · converted to wXMR inside this launch'],
  ['SOL creator buy · exact debit',lamports(buy.amountIn)],
  ['Estimated wXMR from SOL · Raydium CLMM',buy.wxmrQuotedRaw?wxmr(buy.wxmrQuotedRaw):unavailable],
  ['Estimated wXMR to the bonding curve',wxmr(buy.curvePrincipalRaw)],
  ['Estimated trading fee · in wXMR',wxmr(buy.totalCurveFeeRaw)],
  ['Expected tokens after transfer tax',tokens(buy.expectedNetOutputRaw)],
  ['Simulated tokens received',tokens(buy.simulatedNetOutputRaw)],
  ['Minimum tokens received · signed',tokens(buy.minOut)],
  ['Token transfer tax · estimated',tokens(buy.transferFeeRaw)],
  ['Launch rent and network fees · excluding the buy',buy.launchDebitLamports===undefined?unavailable:lamports(buy.launchDebitLamports)],
  ['Creator SOL balance before',buy.balanceBeforeRaw===undefined?unavailable:lamports(buy.balanceBeforeRaw)],
  ['Your wXMR balance',buy.wxmrExists?`${wxmr(buy.wxmrBeforeRaw||'0')} · unchanged`:'No wXMR account · one is created and left empty (rent is in launch costs)'],
  ['Your wSOL balance',buy.wsolExists?`${formatLaunchUnits(buy.wsolBeforeRaw||'0',9)} wSOL · unchanged, account kept`:'No wSOL account · a temporary one is created and closed in this transaction'],
  ['Signed quote expires',buy.quoteExpiresAt?new Date(buy.quoteExpiresAt*1000).toLocaleTimeString():unavailable],
 ]:[
  ['Total creator buy debit',quote(buy.amountIn)],
  ['To the bonding curve',quote(buy.curvePrincipalRaw)],
  ['Trading fee · included in total',quote(buy.totalCurveFeeRaw)],
  ['Expected tokens after transfer tax',tokens(buy.expectedNetOutputRaw)],
  ['Simulated tokens received',tokens(buy.simulatedNetOutputRaw)],
  ['Minimum tokens received',tokens(buy.minOut)],
  ['Token transfer tax',tokens(buy.transferFeeRaw)],
  ['Creator wXMR balance before',buy.balanceBeforeRaw===undefined?unavailable:quote(buy.balanceBeforeRaw)],
  ['Creator wXMR balance after buy',buy.balanceBeforeRaw===undefined?unavailable:quote(String(BigInt(buy.balanceBeforeRaw)-BigInt(buy.amountIn)))],
 ];
 return <section className="setup-note" aria-label="Atomic creator buy review"><h3>Creator buy · {sol?'paid in SOL · ':''}part of this launch</h3><dl>{facts.map(([label,value])=><div key={label} style={{minWidth:0,flexWrap:'wrap',gap:'4px 16px'}}><dt>{label}</dt><dd className={/^-?\d/.test(value)?'gx-num':undefined} style={{minWidth:0,overflowWrap:'anywhere',fontVariantNumeric:'tabular-nums'}}>{value}</dd></div>)}</dl>{sol?<p className="small muted">Your token stays paired with wXMR. The exact SOL amount is swapped to wXMR on the Raydium SOL/wXMR pool and all of that wXMR buys your token, in the same transaction that creates it. The signed {buy.slippageBps/100}% limit fixes the minimum tokens you receive after transfer tax; a price move beyond it fails the whole launch. If any step fails, everything is rolled back; network fees may still apply.</p>:<p className="small muted">The {buy.slippageBps/100}% slippage limit applies to the minimum received. Creating the token and this purchase settle in one transaction. If either fails, both are rolled back; network fees may still apply. SOL account rent and network fees are shown separately below.</p>}</section>;
}
