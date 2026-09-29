export const GRADUATION_COVERAGE = "Graduation to Raydium CPMM is handled by Raydium's automated migration, which Raydium support confirmed applies to all LaunchLab platforms. Our audit: 25/25 sampled third-party launches (SOL and wXMR) migrated within seconds. Confirmed by Raydium support, not a contractual guarantee.";
export const GRADUATION_EVIDENCE_URL = "/research/graduation-keeper-evidence.html";
export function GraduationCoverage() {
 return <><p>{GRADUATION_COVERAGE}</p><p className="small muted">Support source: Discord ticket, 29 September 2026, 07:55 Israel time, as reported by Grainpad’s founder. The audit sample was selected from successful migrations; 25/25 is not a measured success rate for all completed curves.</p><p><a className="inline-link" href={GRADUATION_EVIDENCE_URL} target="_blank" rel="noreferrer">Read the support statement and 25-transaction migration evidence</a></p></>;
}
