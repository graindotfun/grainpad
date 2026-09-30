import { z } from "zod";
import { moneroRecordSummary } from "./monero-record-status.mjs";

export const MONERO_ROADMAP = [
  {
    status: "Planned",
    title: "Grainpad-operated Monero node",
    description: "Our first infrastructure priority immediately after launch: run a Grainpad-operated Monero node for independent verification of launch records. Deployment and synchronization are pending; the node is not operating yet.",
  },
  {
    status: "Planned",
    title: "Support Monero open-source",
    description: "Once net platform revenue is positive, a share will be donated to Monero community funds (CCS or MAGIC Monero Fund). Every donation gets a public receipt on /transparency.",
  },
  {
    status: "Built",
    title: "Monero launch records",
    description: `Record each Grainpad launch's provenance on Monero mainnet in a GRN1 record: Solana mint, metadata hash and the creator's Solana signature, verified after 10 Monero confirmations. Trading and token state remain on Solana. ${moneroRecordSummary()}`,
  },
  {
    status: "Exploring",
    title: "Open lab research",
    description: "Publish the earlier p/xmr-inspired lab research (Monero regtest, test funds only) for public review. Historical; not the production record path.",
  },
  {
    status: "Exploring",
    title: "Real XMR, not wrapped",
    description: "Research atomic-swap based XMR support. Research only, no timeline.",
  },
];

export const MONERO_DISCLAIMER = "Grainpad is not affiliated with the Monero Project, CCS or MAGIC Monero Fund. Donations are voluntary, from platform revenue only. The percentage will be announced once revenue is positive.";
export const DONATIONS_EMPTY = "No donations yet. First donation after net revenue is positive.";
export const FUNDS = {
  CCS: { name: "CCS", url: "https://ccs.getmonero.org/", proofOrigins: ["https://ccs.getmonero.org"] },
  MAGIC: { name: "MAGIC Monero Fund", url: "https://magicgrants.org/funds/monero/", proofOrigins: ["https://magicgrants.org", "https://donate.magicgrants.org"] },
};

// Preserve the recorded decimal strings: no floating-point conversion or live USD pricing.
const donationSchema = z.object({
  date: z.string().date(),
  fund: z.enum(["CCS", "MAGIC"]),
  amountXmr: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,12})?$/).refine(value => /[1-9]/.test(value)),
  amountUsd: z.string().regex(/^(0|[1-9]\d*)\.\d{2}$/),
  revenuePeriod: z.string().trim().min(1),
  proof: z.union([
    z.object({ url: z.string().url() }).strict(),
    z.object({ txId: z.string().regex(/^[a-fA-F0-9]{64}$/) }).strict(),
  ]),
}).strict().superRefine((donation, ctx) => {
  if (!("url" in donation.proof)) return;
  const url = new URL(donation.proof.url);
  if (url.username || url.password || !FUNDS[donation.fund].proofOrigins.includes(url.origin)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["proof", "url"], message: "Proof must link to the selected fund's site." });
  }
});

export function readDonations(data) {
  return z.array(donationSchema).parse(data);
}
