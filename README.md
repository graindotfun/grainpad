# grainpad.

Open tools for checking Grainpad launch provenance on Monero.

This repository contains the **GRN1 record codec, creator authorization checks,
daemon response validation and a runnable read-only record inspector**. The
protocol modules are exported unchanged from the application source, with
file hashes in [PUBLIC_EXPORT_MANIFEST.json](PUBLIC_EXPORT_MANIFEST.json).

Grainpad is a Solana launchpad. Its GRN1 records commit to the Solana mint,
metadata hash and creator authorization inside a Monero transaction. Trading
and token balances stay on Solana. GRN1 carries no token balances or transfers
and provides no bridge or private trading.

## Run it

Requires Node.js 22.22.3 or later and npm. Tests generate disposable keys in
memory, use mocked data or a local HTTP server, and move no funds.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run verify:public
```

To read a mined transaction with your own synchronized Monero mainnet daemon:

```sh
MONERO_DAEMON_URL=http://127.0.0.1:18081 npm run read:record -- --tx YOUR_TRANSACTION_HASH
```

For receipt matching, supply all three immutable fields from the receipt:

```sh
MONERO_DAEMON_URL=http://127.0.0.1:18081 npm run read:record -- \
  --tx YOUR_TRANSACTION_HASH \
  --mint SOLANA_MINT \
  --metadata-hash METADATA_SHA256 \
  --creator SOLANA_CREATOR
```

The inspector checks the signature, daemon-reported block membership and
confirmations, then rechecks the block. Ten confirmations and matching supplied
identity produce `receipt-matched`; fewer confirmations produce `pending`.
Without receipt fields, a confirmed record is only `signature-valid`.
This is a daemon observation, not independent Monero consensus or proof of
a completed Solana launch. [Verification details](docs/VERIFICATION.md).

## Build with it

- [GRN1 binary format and signature domains](docs/GRN1.md)
- [`lib/monero-record.mjs`](lib/monero-record.mjs): encode, decode and verify v1/v2 records
- [`lib/monero-creator-message.mjs`](lib/monero-creator-message.mjs): derive authorization from reviewed identity
- [`lib/monero-index.mjs`](lib/monero-index.mjs): bounded daemon reads, confirmation and receipt helpers
- [`lib/read-record.mjs`](lib/read-record.mjs): one-transaction mainnet inspector
- [Contributing](CONTRIBUTING.md) and [private vulnerability reporting](SECURITY.md)

## Release scope

This is a focused open-source component release. The full website, operated
transaction services, production configuration, reward execution and private
development history are outside this release. It is not a self-hostable copy
of the complete Grainpad product or an independently audited implementation.

Original exported code and tools use **GPL-3.0-only**. Dependencies retain their
licenses. Source availability does not grant rights to Grainpad branding or
imply endorsement of a fork. See [LICENSE](LICENSE) and
[third-party notices](THIRD_PARTY_NOTICES.md).

[Website](https://grainpad.fun) · [Lab](https://grainpad.fun/lab) ·
[Updates](https://x.com/GrainXMR)
