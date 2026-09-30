/**
 * Public status and wording for the Grainpad Monero record layer (GRN1 v1).
 * Every public surface reads its Monero claims from here, so the first confirmed
 * live record needs one edit to LIVE_RECORD, not a copy rewrite.
 *
 * Plain data only: this file is imported by client components and must not pull in
 * lib/monero-record.mjs (node:crypto). tests/monero-narrative.test.mjs checks that
 * the numbers below equal the encoder's constants.
 */

/** Canonical product description. Architecture, not a claim that a record exists. */
export const MONERO_NARRATIVE = 'Grainpad records launch provenance on Monero mainnet. Trading and token state remain on Solana.';

export const GRN1 = {
  magic: 'GRN1',
  version: 1,
  recordBytes: 185,
  extraFieldBytes: 189,
  confirmationsRequired: 10,
  feeCapXmr: '0.02',
  spec: 'https://github.com/graindotfun/grainpad/blob/main/docs/MONERO_RECORD.md',
};

/**
 * The first live record. null until a real Grainpad launch record (intended: GRAINU)
 * is broadcast on Monero mainnet and has 10 confirmations. Set it to
 * {symbol, mint, txHash, height, confirmedAt} only then.
 */
export const LIVE_RECORD = null;

/** Status labels. The live labels are used only when LIVE_RECORD is set. */
export function moneroRecordStatus(live = LIVE_RECORD) {
  if (live) return [
    {label: 'MAINNET PATH BUILT', state: 'done'},
    {label: 'SIGNED CONSTRUCTION PROOF COMPLETE', state: 'done'},
    {label: `LIVE RECORD: ${live.symbol} · ${GRN1.confirmationsRequired}+ CONFIRMATIONS`, state: 'done'},
  ];
  return [
    {label: 'MAINNET PATH BUILT', state: 'done'},
    {label: 'SIGNED CONSTRUCTION PROOF COMPLETE', state: 'done'},
    {label: 'LIVE RECORD: NOT YET PUBLISHED', state: 'pending'},
  ];
}

/** One-sentence status for surfaces too small for the chips. Flips with LIVE_RECORD. */
export function moneroRecordSummary(live = LIVE_RECORD) {
  return live
    ? `First live record: ${live.symbol}, verified after ${GRN1.confirmationsRequired} Monero confirmations.`
    : 'The mainnet path is built and a signed construction proof is complete; no live record has been published yet.';
}

/** What the record layer is. Each line is backed by code in lib/monero-*.mjs. */
export const MONERO_RECORD_FACTS = [
  `Each Grainpad launch record is one packed binary ${GRN1.magic} v${GRN1.version} record of ${GRN1.recordBytes} bytes, carried in a single ${GRN1.extraFieldBytes}-byte Grainpad field in a Monero transaction's tx_extra.`,
  'The record commits to the Solana mint and the SHA-256 metadata hash, and names the creator’s Solana public key.',
  'The creator authorizes the record with a Solana (Ed25519) signature. Grainpad rejects a record whose signature does not verify.',
  'A repeated record nonce, a repeated Monero transaction, or a second record for the same Solana mint is treated as a duplicate.',
  `Grainpad marks a record verified only after ${GRN1.confirmationsRequired} Monero confirmations and a match with the Solana mint, metadata hash and creator on the Grainpad receipt. Fewer confirmations stay pending.`,
  'Indexing is independent and read-only. The format and decoder are public, so anyone can check a record against a Monero node; Grainpad’s own daemon client allows read methods only and cannot sign or send.',
  'The public receipt shows the Solana launch and its Monero record side by side.',
];

/** What the record layer is not. Kept next to the facts on every surface that explains GRN1. */
export const MONERO_RECORD_LIMITS = [
  'Trading, balances and token state remain on Solana. Monero carries no token balances and no token transfers.',
  'Users do not send or hold XMR for a record. The Monero network fee is paid from a dedicated Grainpad fee wallet, capped at 0.02 XMR per record.',
  'It is not a bridge and Grainpad takes no custody of user funds.',
  'It does not make Solana trades or balances private.',
  'GRN1 is Grainpad’s own format. It is not an XMR20 inscription and is not XMR20-compatible.',
];

/** Where the proof stands. Each entry names the evidence it rests on. */
export const MONERO_PROOF_STATUS = {
  built: [
    'GRN1 v1 encoder and decoder, with fixed layout, checksum and version checks',
    'Creator Solana signature verification',
    'Duplicate and replay protection (nonce, transaction and mint)',
    '10-confirmation pending/verified index logic',
    'Receipt integration: the receipt reports not published, pending or verified',
    'Local pre-relay checks on a constructed transaction: one Grainpad field, fee-wallet-only outputs, fee cap',
    'A mainnet-compatible Monero transaction carrying a GRN1 record, built and signed locally with wallet2::create_transactions_2; the recorded semantic, non-input consensus and RingCT non-semantic checks passed',
  ],
  notYet: [
    'A Grainpad launch record published to Monero mainnet',
    '10-confirmation public indexing of that live record',
    'A receipt showing the same real Solana mint and metadata hash as the Monero record',
  ],
  caveat: 'The signed construction proof used fixture mint and metadata-hash data, not a live Solana launch, and was not broadcast; the source refuses to relay it. The first broadcast must bind to a real Grainpad launch, GRAINU, and needs the owner\u2019s approval of that exact transaction.',
};
