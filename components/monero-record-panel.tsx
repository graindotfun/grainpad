import "@/app/monero-record.css";
import {Check, Circle, ShieldCheck} from "lucide-react";
import {GRN1, LIVE_RECORD, MONERO_NARRATIVE, MONERO_RECORD_FACTS, MONERO_RECORD_LIMITS, liveRecordLinks, moneroProofStatus, moneroRecordStatus} from "@/lib/monero-record-status.mjs";

/** Status chips. Wording comes only from lib/monero-record-status.mjs. */
export function MoneroRecordStatus() {
  return <ul className="monero-status" aria-label="Monero record status">{moneroRecordStatus().map(item => <li key={item.label} className={item.state === "done" ? "is-done" : "is-pending"}>{item.state === "done" ? <Check size={14} aria-hidden/> : <Circle size={12} aria-hidden/>}{item.label}</li>)}</ul>;
}

/** The verified live record with its cross-chain proof links. Renders nothing before LIVE_RECORD is set. */
export function MoneroLiveRecord() {
  const live = LIVE_RECORD, links = liveRecordLinks(live);
  if (!live || !links) return null;
  return <dl className="monero-live" aria-label={`${live.symbol} Monero record`}>
    <div><dt>Launch</dt><dd>{live.symbol}</dd></div>
    <div><dt>Solana mint</dt><dd><a className="address-line" href={links.solana} target="_blank" rel="noreferrer">{live.mint}</a></dd></div>
    <div><dt>Metadata hash</dt><dd className="address-line">{live.metadataHash}</dd></div>
    <div><dt>Monero transaction</dt><dd><a className="address-line" href={links.monero} target="_blank" rel="noreferrer">{live.txHash}</a></dd></div>
    <div><dt>Block height</dt><dd>{live.height.toLocaleString("en-US")}</dd></div>
    <div><dt>Confirmations at verification</dt><dd>{live.confirmations}</dd></div>
    <div><dt>Public receipt</dt><dd><a href={links.receipt}>{live.symbol} receipt: both chains</a></dd></div>
  </dl>;
}

/** Built / proven / not-yet lists. Flips with LIVE_RECORD. */
export function MoneroProofLists() {
  const proof = moneroProofStatus();
  return <div className="limitations-grid"><div><h3>Built and verified locally</h3><ul className="monero-limits">{proof.built.map(line => <li key={line}>{line}</li>)}</ul></div>
    {proof.proven.length > 0 && <div><h3>{proof.provenHeading}</h3><ul className="monero-limits">{proof.proven.map(line => <li key={line}>{line}</li>)}</ul></div>}
    {proof.notYet.length > 0 && <div><h3>Not yet proven on mainnet</h3><ul className="monero-limits">{proof.notYet.map(line => <li key={line}>{line}</li>)}</ul></div>}</div>;
}

/** The current Grainpad Monero architecture: GRN1 records on Monero mainnet. */
export function MoneroRecordPanel() {
  const links=liveRecordLinks(LIVE_RECORD);
  return <section className="monero-records" aria-labelledby="monero-records-heading">
    <div className="page-heading"><div><p className="eyebrow">MONERO LAB / LAUNCH RECEIPTS</p><h1 id="monero-records-heading">A launch.<br/>A second-chain receipt.</h1></div><p>A place to inspect Grainpad’s Monero record layer. It connects a Solana token to its creator’s approval and the token details recorded at that time.</p></div>
    <div className="monero-purpose"><p className="eyebrow">WHY IT EXISTS</p><h2>Another place to check the launch.</h2><p>The receipt lets you compare the token’s mint and metadata hash with a creator-authorized record carried on Monero. Trading stays on Solana; the record gives you additional evidence to inspect.</p><a className="text-link" href="/docs#monero-records">How the record works ↗</a></div>
    <ol className="monero-path" aria-label="How launch records connect the two chains"><li><span>01 / SOLANA</span><h3>A token launches</h3><p>The mint identifies the token. A metadata hash identifies the recorded token details.</p></li><li><span>02 / CREATOR</span><h3>The creator approves</h3><p>A Solana signature authorizes the record linking the creator, mint and metadata hash.</p></li><li><span>03 / MONERO</span><h3>A receipt is verified</h3><p>The record is checked against the launch and requires {GRN1.confirmationsRequired} Monero confirmations.</p></li></ol>
    <section className="monero-example" aria-labelledby="monero-example-heading"><div><p className="eyebrow">VERIFIED EXAMPLE</p><h2 id="monero-example-heading">{LIVE_RECORD?`${LIVE_RECORD.symbol}: inspect the evidence.`:'Record publication status.'}</h2><p>{LIVE_RECORD?'This is the verified example receipt. Check each token’s own receipt for its publication status.':'A verified example will appear here after its record is published and checked.'}</p></div>{links&&<a className="monero-receipt-link" href={links.receipt}>Open the receipt <Check size={16}/></a>}</section>
    <details className="monero-evidence"><summary>Inspect record details <span>Mint, metadata and transaction ↗</span></summary><MoneroRecordStatus/><MoneroLiveRecord/></details>
    <div className="launch-grid lab-grid monero-explanation"><section className="panel"><div className="panel-title"><h2>What this adds</h2></div><ul className="monero-limits"><li>A creator-authorized link between the Solana mint and its recorded token details.</li><li>A Monero transaction you can inspect alongside the Solana launch.</li><li>A way to compare hashes and signatures rather than rely on a badge alone.</li></ul><p className="small muted">{MONERO_NARRATIVE}</p></section><aside className="panel"><div className="panel-title"><h2>What this does not add</h2></div><p>It does not make your Solana wallet, trades or balances private. It is not a bridge, XMR backing or a Monero token launch.</p><p className="small muted">You do not need native XMR for a record. Grainpad’s dedicated fee wallet pays the record fee.</p></aside></div>
    <details className="monero-evidence monero-technical"><summary>Protocol &amp; verification <span>{GRN1.magic} · source and limitations ↗</span></summary><div className="lab-stats"><article><span className="eyebrow">FORMAT</span><strong>{GRN1.magic} v1 / v2</strong><span>{GRN1.recordBytes}-byte record</span></article><article><span className="eyebrow">TX_EXTRA FIELD</span><strong>{GRN1.extraFieldBytes} bytes</strong><span>One Grainpad field per transaction</span></article><article><span className="eyebrow">VERIFIED AFTER</span><strong>{GRN1.confirmationsRequired} confirmations</strong><span>Fewer stay pending</span></article></div><div className="launch-grid lab-grid"><section className="panel"><div className="panel-title"><ShieldCheck size={20}/><h2>What gets recorded</h2></div>{MONERO_RECORD_FACTS.map(line=><div className="check-line" key={line}><Check/><span>{line}</span></div>)}</section><aside className="panel"><h2>Scope and limitations</h2><ul className="monero-limits">{MONERO_RECORD_LIMITS.map(line=><li key={line}>{line}</li>)}</ul></aside></div><section className="panel limitations"><h2>Proof status</h2><MoneroProofLists/><p className="setup-note">{moneroProofStatus().caveat}</p><a className="text-link" href={GRN1.spec}>Read the {GRN1.magic} specification ↗</a></section></details>
  </section>;
}
