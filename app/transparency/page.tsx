import "@/app/marketing-refinements.css";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { GraduationCoverage } from "@/components/graduation-coverage";
import { MoneroDisclaimer } from "@/components/monero-disclaimer";
import donationData from "@/data/donations.json";
import { DONATIONS_EMPTY, FUNDS, MONERO_ROADMAP, readDonations } from "@/lib/monero-content.mjs";
import { SITE } from "@/lib/site-config";
import "./transparency.css";

export const metadata: Metadata = {
  title: "Transparency — Grainpad",
  description: "Grainpad's commitment to Monero open-source and public donation receipts.",
  alternates: { canonical: `${SITE.origin}/transparency` },
};

export default function TransparencyPage() {
  const donations = readDonations(donationData);
  return <main className="shell record-shell grain-updates">
    <a className="skip-content" href="#main-content">Skip to transparency</a><SiteHeader/>
    <header className="page-heading record-heading" id="main-content"><div><p className="eyebrow">GRAINPAD / PUBLIC RECORD</p><h1>Transparency<span>.</span></h1></div><a href="/roadmap" className="record-link">View roadmap</a></header>
    <section className="record-commitment" aria-labelledby="commitment-heading">
      <h2 id="commitment-heading">Commitment</h2>
      <div><h3>{MONERO_ROADMAP[0].title}</h3><p>{MONERO_ROADMAP[0].description}</p><nav className="record-funds" aria-label="Community funds">{Object.values(FUNDS).map(fund => <a key={fund.name} href={fund.url} target="_blank" rel="noreferrer">{fund.name}</a>)}</nav></div>
    </section>
    <section className="record-donations" aria-labelledby="donations-heading">
      <h2 id="donations-heading">Donations</h2>
      <div className="donations-scroll" role="region" aria-label="Donation records" tabIndex={0}>
        <table className="donations-table"><caption className="sr-only">Public donation receipts</caption><thead><tr><th scope="col">Date</th><th scope="col">Fund</th><th scope="col">Amount <span>XMR + USD at time of donation</span></th><th scope="col">Revenue period</th><th scope="col">Proof</th></tr></thead>
          <tbody>{donations.length ? donations.map((donation, index) => <tr key={`${donation.date}-${index}`}><td><time dateTime={donation.date}>{donation.date}</time></td><td><a href={FUNDS[donation.fund].url} target="_blank" rel="noreferrer">{FUNDS[donation.fund].name}</a></td><td><span className="donation-amount">{donation.amountXmr} XMR</span><span className="donation-usd">${donation.amountUsd} USD</span></td><td>{donation.revenuePeriod}</td><td>{"url" in donation.proof ? <a href={donation.proof.url} target="_blank" rel="noreferrer">Fund confirmation</a> : <code className="donation-tx">{donation.proof.txId}</code>}</td></tr>) : <tr><td colSpan={5} className="donations-empty">{DONATIONS_EMPTY}</td></tr>}</tbody>
        </table>
      </div>
    </section>
    <section className="record-commitment" aria-labelledby="graduation-heading"><h2 id="graduation-heading">Graduation</h2><div className="record-graduation"><GraduationCoverage/></div></section>
    <MoneroDisclaimer/>
    <SiteFooter showResearchDisclaimer={false}/>
  </main>;
}
