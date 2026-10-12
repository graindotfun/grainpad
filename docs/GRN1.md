# GRN1 provenance records

GRN1 is Grainpad's application record format. It is not XMR20, a Monero
consensus token standard or an asset bridge. A record binds a Solana mint,
metadata SHA-256, creator key and replay nonce under the creator's Ed25519
signature. It does not encode token balances, transfers or economic policy.

## Binary layout

Both versions have the same 185-byte layout. All offsets are zero-based.

| Offset | Bytes | Field |
| --- | ---: | --- |
| 0 | 4 | ASCII `GRN1` |
| 4 | 2 | Version 1 or 2, unsigned little-endian |
| 6 | 32 | Raw Solana mint |
| 38 | 32 | Metadata SHA-256 |
| 70 | 32 | Creator Ed25519 public key |
| 102 | 64 | Creator signature |
| 166 | 16 | Replay nonce |
| 182 | 1 | Flags, exactly zero |
| 183 | 2 | First two SHA-256 bytes of bytes 0–182 |

The checksum detects corruption; signature verification provides authorization.
Parsing or a valid checksum alone is not proof of creator authorization.

## Signing messages

Version 1 signs UTF-8 `grainpad.monero-record.v1` followed by one NUL byte,
then the magic, version, mint, metadata hash, creator, nonce and flags.
The signature and checksum are not part of the signing message.

Version 2 signs the exact UTF-8 text returned by
[`creatorAuthorizationTextV2`](../lib/monero-creator-text-v2.mjs). Preserve its
domain, network labels, capitalization, field order and newline bytes. No
trailing newline is appended. Changing these bytes defines a different
authorization. Version 1 and version 2 signatures are not interchangeable.

[`canonicalCreatorMessage`](../lib/monero-creator-message.mjs) derives the
message from the mint, creator, metadata hash and nonce presented to the user.
It rejects server-supplied bytes that differ from those derived values.

## Monero carrier

The record occupies one `tx_extra` nonce field: tag `0x02`, canonical varint
length 186, Grainpad marker `0x7f`, and the 185-byte record. This field is 189
bytes including its header. Ordinary native transaction fields also remain
in `tx_extra`; 189 is not the entire transaction size.

The decoder accepts bounded ordinary pubkey, padding, additional-pubkey and
nonce fields. It skips unrelated nonces and rejects unsupported tags,
truncation, nonminimal lengths, oversized envelopes and duplicate GRN1 records.
The supported extra bound is 1,060 bytes. Unknown future formats fail closed.

## Acceptance boundaries

Verify the creator signature, the intended mint, metadata hash and creator,
canonical daemon-reported inclusion and at least ten confirmations. `get_info`
height is a block count; a transaction at block 100 has ten confirmations at
height 110. Treat missing, unsynchronized or stale observations as unavailable.

The low-level index helpers reject repeated transaction hashes, nonces and
mints within the supplied index state. That state is caller-owned and does
not automatically persist, discover the full chain or handle reorgs. The
single-record inspector does not claim global duplicate absence. A complete
application index must persist its accepted state and invalidate reorged data.

Matching a caller-supplied receipt is distinct from independently verifying
Solana account state and launch execution. The inspector performs the former.
