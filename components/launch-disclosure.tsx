import {GraduationCoverage} from "@/components/graduation-coverage";
import {MONERO_NARRATIVE,moneroRecordSummary} from "@/lib/monero-record-status.mjs";
export function LaunchDisclosure({expanded=false}:{expanded?:boolean}) {
 return <details className="setup-note" open={expanded||undefined}>
  <summary><strong>Grainpad v1 · Authority &amp; graduation disclosures</strong></summary>
  <p>Grainpad uses Raydium LaunchLab. A dedicated admin wallet, funded from the founder’s personal trading wallet, controls platform settings and can change platform fees, including on existing curve pools, and change or remove launch rules. No multisig or timelock is active.</p>
  <p>Graduation at the selected 85 SOL or 20 wXMR reserve target depends on Raydium’s migration service. A successful creation simulation does not verify graduation; a pool could remain waiting for migration.</p><GraduationCoverage/>
  <p>In v1, 30% of eligible platform fees collected in SOL (claimed as wSOL) is allocated to GRAIN purchases and burns. wXMR fees are tracked separately, with no buyback allocation and no conversion. The owner signs each execution; the allocation is not enforced by an on-chain vault. No collections means no funded buyback. GRAIN grants no revenue, yield or redemption rights.</p>
  <p>{MONERO_NARRATIVE} {moneroRecordSummary()} The Monero record carries no token balances, is not a bridge and does not make Solana trades private. Inspired by p/xmr; the earlier p/xmr research is regtest-only. No XMR backing, native XMR settlement or affiliation with Monero or the p/xmr author. A future governance or curve change may require new platform accounts and will not automatically move existing tokens.</p>
  <p><a className="inline-link" href="/docs">Read the Docs: launch rules, fees and verification</a></p>
 </details>;
}
