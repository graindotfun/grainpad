import {GraduationCoverage} from "@/components/graduation-coverage";
import {MONERO_NARRATIVE,moneroRecordSummary} from "@/lib/monero-record-status.mjs";
export function LaunchDisclosure({expanded=false}:{expanded?:boolean}) {
 return <details className="setup-note" open={expanded||undefined}>
  <summary><strong>grainpad v1 · Authority &amp; graduation disclosures</strong></summary>
  <p>grainpad uses Raydium LaunchLab. A dedicated admin wallet, funded from the founder’s personal trading wallet, controls platform settings and can change platform fees, including on existing curve pools, and change or remove launch rules. No multisig or timelock is active.</p>
  <p>Rewards launches graduate at a 20 wXMR reserve target; classic SOL-paired launches graduate at the selected85SOL target. Migration depends on Raydium’s service. A successful creation simulation does not verify graduation; a pool could remain waiting for migration.</p><GraduationCoverage/>
  <p>Transfer-tax conversions allocate 50% to holders of the source token, 15% to official GRAIN purchase-and-burn and 35% to grainpad. This requires an approved, funded operator and a live official GRAIN pool. The separate legacy treasury allocates 30% of eligible SOL platform fees, but its builder currently does not support official Token-2022 GRAIN. Platform fees received in wXMR are tracked separately there. No collections means no funded buyback. GRAIN grants no revenue, yield or redemption rights.</p>
  <p>{MONERO_NARRATIVE} {moneroRecordSummary()} The Monero record carries no token balances, is not a bridge and does not make Solana trades private. Inspired by p/xmr; the earlier p/xmr research is regtest-only. No XMR backing, native XMR settlement or affiliation with Monero or the p/xmr author. A future governance or curve change may require new platform accounts and will not automatically move existing tokens.</p>
  <p><a className="inline-link" href="/docs">Read the Docs: launch rules, fees and verification</a></p>
 </details>;
}
