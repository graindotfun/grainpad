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
  return <section className="monero-records" aria-labelledby="monero-records-heading">
    <div className="page-heading"><div><p className="eyebrow">MONERO MAINNET RECORDS / {GRN1.magic} v{GRN1.version}</p><h1 id="monero-records-heading">Launch provenance on Monero.</h1></div><p>{MONERO_NARRATIVE}</p></div>
    <MoneroRecordStatus/>
    <MoneroLiveRecord/>
    <div className="lab-stats"><article><span className="eyebrow">FORMAT</span><strong>{GRN1.magic} v{GRN1.version}</strong><span>{GRN1.recordBytes}-byte packed binary record</span></article><article><span className="eyebrow">TX_EXTRA FIELD</span><strong>{GRN1.extraFieldBytes} bytes</strong><span>One Grainpad field per transaction</span></article><article><span className="eyebrow">VERIFIED AFTER</span><strong>{GRN1.confirmationsRequired} confirmations</strong><span>Fewer stay pending</span></article></div>
    <div className="launch-grid lab-grid"><section className="panel"><div className="panel-title"><ShieldCheck size={20}/><h2>What gets recorded</h2></div>{MONERO_RECORD_FACTS.map(line => <div className="check-line" key={line}><Check/><span>{line}</span></div>)}</section>
    <aside className="panel"><div className="panel-title"><h2>What it is not</h2></div><ul className="monero-limits">{MONERO_RECORD_LIMITS.map(line => <li key={line}>{line}</li>)}</ul></aside></div>
    <section className="panel limitations"><h2>Proof status</h2><MoneroProofLists/><p className="setup-note">{moneroProofStatus().caveat}</p><a className="text-link" href={GRN1.spec} target="_blank" rel="noreferrer">Read the {GRN1.magic} v{GRN1.version} specification</a></section>
  </section>;
}
