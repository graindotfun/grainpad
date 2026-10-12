# What the tools verify

The record inspector uses a daemon you select through `MONERO_DAEMON_URL`.
It does not depend on a Grainpad catalog, private database or signing service.
It requires a synchronized Monero mainnet daemon with successful, trusted
response shapes. Its allowlisted daemon client contains only read methods.

For a requested transaction it:

1. Reads synchronized mainnet height and the exact requested transaction.
2. Rejects mempool or unavailable transactions and malformed heights.
3. Checks the transaction belongs to its daemon-reported mined block.
4. Parses one canonical GRN1 record and verifies its creator signature.
5. Matches all supplied receipt identity fields when requested.
6. Rechecks the block and rejects a changed checkpoint or regressed height.
7. Reports confirmations at the original observed height.

The endpoint is trusted chain input. These are RPC checks, not independent
consensus validation or a cryptographic transaction-inclusion proof. A malicious
daemon can fabricate chain observations. Compare independently operated nodes
or run your own fully validated node for stronger assurance. A block may reorg
after the observation; do not treat a saved JSON report as fresh evidence.

`receipt-matched` means the verified record has ten confirmations under those
daemon observations and matches the identity you supplied. It does not prove
the receipt is authentic, the Solana launch completed, global nonce uniqueness,
wrapped-asset backing, token value or the running website's entire source.

The unchanged protocol modules are identified individually by manifest hashes.
The manifest's source commit identifies the extraction point; it is not a
claim that the complete application repository or deployed service is public.
The inspector is additive public tooling and is labeled separately from the
unchanged protocol modules.

Tests exercise both signature versions, malformed carriers, forged signatures,
receipt binding, replay helpers, stale observations, daemon method restrictions,
block changes and endpoint redaction. They use disposable keys generated in
memory and mocked chain data. They do not constitute a funded mainnet test or
an independent security audit.
