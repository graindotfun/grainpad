'use client';
import {FEE_POLICY,LAUNCH_ECONOMICS} from '@/lib/fee-policy.mjs';
import {WXMR_WARNING} from '@/lib/quote-assets.mjs';
import {LIVE_RECORD} from '@/lib/monero-record-status.mjs';
import {CopyText} from './copy-text';
import {WxmrWalletNote,WxmrUnwrapLink} from './wxmr-wallet-note';
import type {PlatformStatus} from '@/lib/platform-policy';

export type FaqPlatform=PlatformStatus&{rewards?:{policyApproved:boolean;operational:boolean}};
type Props={platform:FaqPlatform|null;token:{mint:string}|null;tokenState:'loading'|'ready'|'unavailable';solTradingEnabled:boolean;solLookupConfigured:boolean};
export function WalletsFaq({platform,token,tokenState,solTradingEnabled,solLookupConfigured}:Props){
 const split=LAUNCH_ECONOMICS.holderTaxSplit;
 const rates=[platform?.protocolRate,platform?.platformRate,platform?.creatorRate];
 const feesKnown=platform?.exists===true&&platform.stale===false&&rates.every(rate=>typeof rate==='number'&&Number.isFinite(rate)&&rate>=0);
 const rewardsKnown=platform?.stale===false&&typeof platform.rewards?.policyApproved==='boolean'&&typeof platform.rewards?.operational==='boolean';
 const rewardsActive=rewardsKnown&&platform?.rewards?.policyApproved===true&&platform.rewards.operational===true;
 const percent=(rate:number)=>rate/(FEE_POLICY.denominator/100);
 return <div className="wallets-faq">
  <details><summary>I don&apos;t see wXMR in my wallet.</summary><WxmrWalletNote/></details>
  <details><summary>What is &quot;unwrap @ wxmr.io&quot;?</summary><WxmrUnwrapLink/></details>
  <details><summary>What is wXMR? Is it XMR?</summary><p>{WXMR_WARNING}</p></details>
  <details><summary>Can I pay with SOL?</summary><p>{solTradingEnabled&&solLookupConfigured?'SOL route preparation is enabled for supported wXMR markets, subject to live pool, lookup-table and simulation checks.':'Not yet: public SOL route preparation is under review; use wXMR directly for wXMR markets.'} {solLookupConfigured?'grainpad’s own lookup table is configured; it is checked again before a route is prepared.':'The grainpad lookup table must be configured and verified before that route can open.'}</p></details>
  <details><summary>What does a trade cost?</summary><p>{feesKnown?`The current curve fee is ${percent(rates.reduce<number>((sum,rate)=>sum+(rate??0),0))}%: ${percent(platform!.protocolRate!)}% Raydium, ${percent(platform!.platformRate!)}% grainpad and ${percent(platform!.creatorRate!)}% creator.`:'Current curve rates are unavailable; check Platform status before trading.'} After graduation, the selected configuration charges {percent(FEE_POLICY.cpmm.trade)}% CPMM plus {percent(FEE_POLICY.cpmm.creator)}% creator fee, with the token&apos;s transfer tax separate.</p><p>SOL routing can add pool fees, and network costs, rent, price impact and slippage also matter; review the simulated debit and the exact transaction in your wallet before signing.</p></details>
  <details><summary>Where does the transfer tax go?</summary><p>The approved converted-tax split is {split.holdersBps/100}% to eligible holders in wXMR, {split.grainReserveBps/100}% to the GRAIN purchase-and-burn reserve and {split.grainpadBps/100}% to grainpad.</p><p>{rewardsKnown?rewardsActive?'Holder payment status comes from finalized payments, not from this setting.':'Public distribution is not active; published pilot payments do not mean public activation.':'Live distribution status is unavailable.'} <a href="/rewards">Check status and finalized receipts</a>.</p></details>
  <details><summary>Is there a minimum bag for rewards?</summary><p>No minimum holding is required for an otherwise eligible owner to enter the snapshot; tiny payouts carry forward as credit to the same owner, never another holder.</p><p>Payment still depends on the payout threshold, operating budget and service availability; <a href="/rewards">eligibility exclusions and payout details</a> apply.</p></details>
  <details><summary>Which is the official $GRAIN?</summary><p>Use grainpad&apos;s official publication channels, grainpad.fun and @GrainXMR, and verify the full mint; GRAINU is the test token, not $GRAIN.</p>{tokenState==='ready'&&token?<p className="address-line"><code>{token.mint}</code> <CopyText value={token.mint} label="Copy official GRAIN mint"/></p>:<p>{tokenState==='loading'?'Checking the official record…':tokenState==='unavailable'?'Official record unavailable; no address substituted.':'No official GRAIN mint is registered yet.'}</p>}</details>
  <details><summary>What is GRN1?</summary><p>A 185-byte creator-signed launch record in a Monero mainnet transaction, verified by grainpad after 10 confirmations and matching the mint, creator and metadata hash; it is not a bridge and carries no token balances.</p><p>{LIVE_RECORD&&<a href={`/token/${LIVE_RECORD.mint}/receipt`}>GRAINU&apos;s verified receipt</a>} shows an actual record; a Solana launch alone does not prove Monero publication.</p></details>
  <details><summary>Is a Room budget escrow?</summary><p>No: Funded means the creator&apos;s wallet held enough when last checked, without locking funds.</p><p>Recorded payments are checked against finalized transfers.</p></details>
  <details><summary>Do I need a username or X account?</summary><p>No: identity is optional, and trading and Rooms work with a wallet alone.</p><p>Fame voting has its own verified-X requirement.</p></details>
  <details><summary>What is Fame?</summary><p>A wallet-signed +1 or −1 from a profile with verified X: one vote per pair, changeable or removable, with no self-vote.</p><p>It is a light signal, not proof of trust, and it is not Sybil-proof.</p></details>
  <details><summary>Why does something say &quot;unavailable&quot; instead of 0?</summary><p>A missing or failed read does not establish a zero balance; unavailable means we could not verify the value.</p></details>
  <details><summary>Who controls the platform?</summary><p>A single founder key controls grainpad&apos;s platform configuration today; fee destinations and configuration changes are on chain.</p><p>Read the <a href="#trust-model">authority model</a> and <a href="#verification">verification addresses</a>.</p></details>
 </div>;
}
