# Original launch image verification

The receipt can verify original image bytes against an existing launch's metadata commitment. It does not store image files inside Monero or change an existing GRN1/GRNE record.

- Solana: the signed GRN1 metadata hash must match the exact metadata bytes, their content-addressed URI and mint. The metadata's image digest must match the actual image file.
- Robinhood: GRNE v2 commits the registration authorization digest. That digest is recomputed with the exact metadata hash, creator, factory, launch ID, name, symbol, expiry and sequence. The image file must match its content-addressed digest. Legacy records without that binding are explicitly unsupported.
- The online reader requires the existing matching, fresh Monero observation with at least ten confirmations. Unknown, stale, mismatched or unsupported records never receive a verified image label.

The first successful image verification saves a conditional, write-once archive in existing application storage. It contains the original image and metadata bytes. Subsequent checks revalidate this archive against the current launch record without additional source-chain RPC. The original upload can disappear while the archival copy still provides the original bytes. An archive in the same storage account is not an independent storage provider or a promise of permanent availability. Download a copy for independent safekeeping.

The downloadable JSON includes image/metadata bytes in base64, their fingerprints, launch identity and the supplied Monero observation. `node scripts/verify-launch-image-archive.mjs archive.json` verifies byte bindings and record structure/signature offline. Supplied transaction hashes, confirmation counts and observation times are unauthenticated snapshot claims. Offline verification does **not** prove Monero transaction inclusion, current chain state or source-chain finality; these need independent online verification.

No publication job, new Monero record, wallet signature, transaction or payment is created by this feature. Archive reads never fetch arbitrary metadata/image URLs; they use bounded objects in configured application storage. Raster image validation excludes active SVG/HTML. Receipt verification is separate from trading authorization and token safety.
