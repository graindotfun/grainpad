# grainpad.

Grainpad is a live Solana launchpad built on Raydium LaunchLab. Creators launch Token-2022 tokens paired with wXMR, choose a transfer tax and earn creator trading fees. Grainpad processes the transfer tax into wXMR holder rewards and an allocated GRAIN buy-and-burn share.

Trading and token balances stay on Solana. A separate record layer publishes launch provenance on Monero mainnet.

**Public token creation and holder rewards are enabled.** This overview reflects the system as of **6 October 2026**; it is not a continuous operator-health report.

## Official links

- Website: [grainpad.fun](https://grainpad.fun)
- Updates: [@GrainXMR on X](https://x.com/GrainXMR)
- Monero reference record: [Grainpad Lab](https://grainpad.fun/lab)
- Security reports: [security@grainpad.fun](mailto:security@grainpad.fun)

## What creators and holders can do

- Launch a token paired with wXMR through the launch workspace.
- Trade on token pages and inspect the launch receipt.
- Update banners and social links through Creator Desk without rewriting the original signed metadata.
- Claim accrued creator trading fees.
- Participate in Rooms using a wallet; X verification is optional.
- Inspect holder rewards and distinguish pending amounts from finalized payment and burn receipts.

SOL trading routes through a separate SOL/wXMR market when the route is enabled and passes execution checks. The launch pool and holder payouts still use wXMR. Route availability depends on liquidity and current system controls.

## Transfer tax and holder rewards

The launch form offers a **1–3% transfer tax in 0.1% steps**, defaulting to 1%. Official GRAIN uses 2%. This Token-2022 tax applies to applicable token transfers and is additional to trading fees.

For new conversion sources, realized tax-conversion proceeds are allocated as follows:

| Destination | Share |
| --- | ---: |
| Eligible holders of the token that generated the tax | 70% |
| Official GRAIN purchase and burn | 15% |
| Grainpad | 15% |

The Grainpad share is gross revenue before operating costs. Previously frozen allocations retain their original economics.

Grainpad's collector withdraws withheld tokens, converts them to wXMR, records eligible-holder credits and pays them in batches. Eligibility uses recorded balance snapshots, policy exclusions and rounding. Holder rewards are separate from creator trading fees.

**The collector is a Grainpad-operated off-chain service with a signing key.** Collection, conversion, snapshots, payout scheduling and burn execution depend on that service. These steps are automated, but the mechanism is not decentralized or trustless. Pending credits and allocated burn funds are not completed payments or burns. Funding, minimum payment thresholds, liquidity, RPC failures and paused controls can delay execution. No fixed payout schedule or yield is promised.

## What the Monero record proves

Grainpad's `GRN1` record commits to a Solana mint and metadata hash and carries the creator's Solana authorization. It is written into a Monero mainnet transaction's `tx_extra`.

Grainpad marks a record verified only after at least **10 Monero confirmations**, a valid creator signature and a match with the launch receipt. Each launch has its own publication and confirmation status; the verified GRAINU reference record does not establish that every launch has already been recorded.

The record provides provenance. It contains no token balances or transfers, does not bridge assets, spends no user XMR and does not make Solana trading private. Grainpad tokens remain Solana tokens.

## wXMR and current trust assumptions

**wXMR is a third-party wrapped asset, not native XMR.** Grainpad does not issue it, custody its backing or verify its backing or redemption. Using wXMR therefore adds the wrapped asset's issuer, custody and redemption risks.

Grainpad's platform admin is currently a dedicated, founder-controlled **single-signature wallet**. It can change platform fees, recipients and launch rules. **No multisig or timelock is active.** The separate collector key controls transfer-tax withdrawal and reward execution; separating the two wallets does not remove single-key control.

Users approve transactions in their own wallets. The interface, RPC providers, receipt indexing and operator services introduce availability and verification dependencies. Raydium's programs and migration infrastructure have their own authorities and dependencies.

Neither a Monero record nor a published receipt guarantees token value, wrapped-asset solvency or investment safety.

## Trading fees

| Phase | Configured fees |
| --- | --- |
| Bonding curve | 0.25% Raydium protocol + 0.75% Grainpad + 0.25% creator = 1.25% |
| After graduation, selected CPMM configuration | 0.25% trade fee + separate 1% creator fee, where enabled |

The post-graduation fees replace the curve split. Transfer tax, network costs, slippage and applicable third-party fees are separate. Actual debits depend on trade direction and rounding. Platform settings are mutable; inspect the current transaction and chain configuration before relying on a quoted rate.

## Public identities

| Role | Solana address |
| --- | --- |
| Official GRAIN mint | `FCN2KLyUGT9EddKf8MZYjPce8CWxUid7nWpAx9ograin` |
| Platform admin / platform revenue recipient | `FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM` |
| Collector / transfer-tax and platform claim authority / Fee Key authority | `BxJZSApDy7i4VVAQSRCL5FQJ2RCCP676PUWKYEcY1Z6i` |

Verify the full mint address. A `grain` or `grn` suffix alone does not prove authenticity. GRAINU is a historical rehearsal token, distinct from official GRAIN.

## About this repository

This repository contains public project information. Application development is maintained in a private repository. This repository does not contain the application source code, verification tools or a buildable release, and does not provide independent source reproducibility.

This overview is not an independent security audit. Grainpad uses existing Raydium programs for launches and migration; it does not deploy a custom Grainpad launchpad program.

Grainpad's Monero record research was inspired by p/xmr. References to Monero, p/xmr, Solana or Raydium do not imply affiliation or endorsement.
