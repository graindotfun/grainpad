import "@/app/monero-record.css";
import {Check, Circle, ShieldCheck} from "lucide-react";
import {GRN1, MONERO_NARRATIVE, MONERO_PROOF_STATUS, MONERO_RECORD_FACTS, MONERO_RECORD_LIMITS, moneroRecordStatus} from "@/lib/monero-record-status.mjs";

/** Status chips. Wording comes only from lib/monero-record-status.mjs. */
export function MoneroRecordStatus() {
  return <ul className="monero-status" aria-label="Monero record status">{moneroRecordStatus().map(item => <li key={item.label} className={item.state === "done" ? "is-done" : "is-pending"}>{item.state === "done" ? <Check size={14} aria-hidden/> : <Circle size={12} aria-hidden/>}{item.label}</li>)}</ul>;
}

/** The current Grainpad Monero architecture: GRN1 records on Monero mainnet. */
export function MoneroRecordPanel() {
  return <section className="monero-records" aria-labelledby="monero-records-heading">
    <div className="page-heading"><div><p className="eyebrow">MONERO MAINNET RECORDS / {GRN1.magic} v{GRN1.version}</p><h1 id="monero-records-heading">Launch provenance on Monero.</h1></div><p>{MONERO_NARRATIVE}</p></div>
    <MoneroRecordStatus/>
    <div className="lab-stats"><article><span className="eyebrow">FORMAT</span><strong>{GRN1.magic} v{GRN1.version}</strong><span>{GRN1.recordBytes}-byte packed binary record</span></article><article><span className="eyebrow">TX_EXTRA FIELD</span><strong>{GRN1.extraFieldBytes} bytes</strong><span>One Grainpad field per transaction</span></article><article><span className="eyebrow">VERIFIED AFTER</span><strong>{GRN1.confirmationsRequired} confirmations</strong><span>Fewer stay pending</span></article></div>
    <div className="launch-grid lab-grid"><section className="panel"><div className="panel-title"><ShieldCheck size={20}/><h2>What gets recorded</h2></div>{MONERO_RECORD_FACTS.map(line => <div className="check-line" key={line}><Check/><span>{line}</span></div>)}</section>
    <aside className="panel"><div className="panel-title"><h2>What it is not</h2></div><ul className="monero-limits">{MONERO_RECORD_LIMITS.map(line => <li key={line}>{line}</li>)}</ul></aside></div>
    <section className="panel limitations"><h2>Current proof status</h2><div className="limitations-grid"><div><h3>Built and verified locally</h3><ul className="monero-limits">{MONERO_PROOF_STATUS.built.map(line => <li key={line}>{line}</li>)}</ul></div><div><h3>Not yet proven on mainnet</h3><ul className="monero-limits">{MONERO_PROOF_STATUS.notYet.map(line => <li key={line}>{line}</li>)}</ul></div></div><p className="setup-note">{MONERO_PROOF_STATUS.caveat}</p><a className="text-link" href={GRN1.spec} target="_blank" rel="noreferrer">Read the {GRN1.magic} v{GRN1.version} specification</a></section>
  </section>;
}
