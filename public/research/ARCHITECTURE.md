# Architecture and implementation assessment

## What works now

The Python prototype runs native Monero offline regtest with new wallets, an integrated-address buy, a signed registration, view-only incoming-output scanning, deterministic replay and a dry-run sell authorization. Nineteen automated tests cover the worked example, conservation, malformed metadata, duplicate evidence, signature isolation, stale sells, fees and disabled transfer RPC. Native Monero v0.18.5.1 was tested separately.

```
Holder registration + spend-key signature
                  ↓
Immutable payment-ID → payout-address mapping
                  ↓
Monero incoming outputs + daemon block order
                  ↓
Normalized events → integer state machine → root + snapshot
                                            ↓
                              CLI verifier / read-only UI

Holder sell signature → checks → SQLite dry-run receipt
                                (no transaction or debit)
```

The curve wallet, its view-only scanner and its test buyer are separate processes. RPC binds to loopback. The application RPC allowlist excludes transfer and signing calls. Only the isolated native test harness has a mutation helper; it verifies `nettype=fakechain`, `offline=true`, and `mainnet=false` before each mutation of wallets it created itself.

The source specification’s terms are preserved: `piconero`, `grains`, `curve wallet`, `registry_root`, `registry_height`, `holding_bucket`, `refund_queue`, `graduation_pending`, `creator fee`, `operator fee`, and `anchor`.

## Exact curve rules implemented

All amounts are integers. JSON amounts use decimal strings. One XMR is 10^12 piconero and one token is 10^6 grains. Initial virtual reserves are 30 XMR and 1.073 billion tokens. The real curve allocation is 793.1 million tokens; 206.9 million are reserved for liquidity in the specification.

K is fixed at genesis: 32,190,000,000,000,000,000,000,000,000 piconero×grains. Buy fee is floor(input/100); net increases virtual and real XMR reserves; new virtual token reserve is floor(K/new virtual XMR). Fees split in half with the odd piconero going to the operator. The sell quote uses the reverse fixed-K floor rule, deducting its fee and caller-supplied network-fee estimate. The quote requires enough **real** XMR; virtual reserves are not funds.

Deposits are ordered by block height, transaction index, output index. Output identity is `(tx_hash, output_index)`. Duplicate outputs, inconsistent block positions, conflicting block hashes and events with fewer than ten confirmations are rejected. Minimum buy is 0.01 XMR. Slippage failures and overshoots queue a **full pending refund**, without charging a fee or sending money. Unresolved deposits remain in the holding bucket. Conservation is checked after each event.

## Implemented with explicit departures

| Specification area | MVP behavior and limitation |
|---|---|
| Arbitrary `tx_extra` buys | Byte parser is implemented. Stock wallet RPC cannot construct that payload; the native test uses an integrated address with an encrypted 8-byte payment ID. |
| Registration fallback | Signed, domain-bound off-chain records are implemented. Records are needed for replay; availability does not come from Monero alone. Signature covers network, curve, payment ID, payout and minimum output. |
| Genesis | Local configuration binds version, network, curve address, chain genesis hash, restore height and fixed constants. The specification does not provide a complete deployed genesis transaction or encoding; no such transaction is claimed. The original spec file is reference material, not an additional signed chain commitment. |
| Root | A versioned `pxmr-mvp-1` BLAKE2b-256 hash chain begins with a canonical-JSON genesis digest. Events preserve the spec byte prefix and append an explicit version tag, nonce length and registration-message hash. Holding events use reserved op `0x7f`. **Not byte-compatible with a future official implementation.** |
| Anchor circularity | A transaction hash cannot commit a root that includes that same hash. The parser can compare an anchor with the preceding state as an MVP interpretation. No anchor builder, sender authentication or on-chain anchor verification is implemented. |
| Root coverage | Event roots bind height, transaction hash, output index, amount, instruction and registration provenance. The spec prefix does not bind block hash or explicit transaction index. Ordering affects the chain, but branch context is checked separately by fresh replay. Root alone is not complete chain evidence. |
| Outgoing proof | A view key does not establish outgoing spends or correct payouts. Unsigned key-image arrays are insufficient. No incoming replay result is presented as proof of outgoing settlement. |
| Sell authorization | Native spend signatures and the specified canonical string are verified. That string lacks network, curve, root, unique nonce and expiration domains. It is retained only for dry runs. A receipt also binds the current root; this does not repair the original signed message. |
| Graduation / payouts | Overshoots queue full refunds. No final-fill split, liquidity migration, fee withdrawal, refund payout or sell settlement is executed. |
| Implementation language / UI | Python plus a small browser readout replaces the suggested Rust/hosted-site stack for a minimal inspectable implementation. |

## Trust and proof boundaries

An offline bundle and its expected root can be forged together. `verify` states whether it checked snapshot consistency or a fresh local daemon/view-wallet scan. Independently obtain a root when comparing commitments. The scanner depends on the local daemon’s chain view and the supplied registration set. Registration storage is single-writer; the prototype does not solve adversarial data withholding, distributed consensus, malicious operators or denial of service.

Wallet public addresses and deposit information are exposed in registry artifacts. This design must not be advertised as automatically inheriting all Monero privacy properties. View-key publication is part of the source proposal, but no real wallet keys are included in the public package.

## Separate Solana launch surface

Grainpad’s website prepares **Solana** token creation through Raydium LaunchLab. Browser wallets sign metadata messages and transactions themselves. Metadata and images are content-addressed in R2. The server validates wallet signatures, checks the confirmed LaunchLab pool creator and on-chain metadata URI before listing a token. RPC destinations are fixed by network; genesis identity is checked. The wallet remains the final authority over transaction approval.

The launch uses existing Raydium platform configuration, one billion tokens, six decimals, 793.1 million curve allocation, 85 SOL fundraising target and CPMM migration. It does not create an XMR reserve, deploy the Monero registry to mainnet, or give Solana holders claims against the test registry. No initial purchase is included. Costs are simulated and compared to the limit entered by the user. A quote expires after sixty seconds. There is no claim of an audit or permissionless Monero execution.

## Work beyond the MVP

Before real Monero settlement: publish a complete non-circular protocol encoding and test vectors; add signature domains/nonces; define full/partial graduation and refunds; validate outgoing transactions and signed key images; provide durable registration availability and checkpoint rules; add process isolation and authenticated operational APIs; review custody and accounting; commission independent security review. These are substantive protocol tasks, not a two-hour website deployment.

Primary references: [Monero wallet RPC](https://www.getmonero.org/resources/developer-guides/wallet-rpc.html), [Monero daemon RPC](https://www.getmonero.org/resources/developer-guides/daemon-rpc.html), [Raydium LaunchLab platforms](https://docs.raydium.io/products/launchlab/platforms), [Raydium SDK source](https://github.com/raydium-io/raydium-sdk-V2).
