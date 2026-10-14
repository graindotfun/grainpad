# Grainpad launchpad: public source

<img width="1774" height="887" alt="readme-image" src="https://github.com/user-attachments/assets/7c72333a-96e4-47e7-809f-837c06193043" />

The source of the grainpad.fun launchpad: website, product logic, Solana and Robinhood Chain transaction builders, EVM onboarding modules, wallet signing helpers, receipts and charts, GRN1 Monero provenance records, read-only verifiers and tests. Files and commit history are exported from Grainpad's private development repository through a reviewed allowlist. Commits keep their original author dates; distribution commits add the public packaging and verification inventory.

## Publication and development

This is an active public source distribution. Product development continues in a private workspace, and reviewed product changes are published here as incremental updates. The publication scope includes launchpad UI, transaction builders, Robinhood mainnet and testnet contracts and client modules, network selection, tests and verification tools. Each update passes the public inventory, secret scans, tests and build before publication. Private operational changes do not create empty public commits.

The source is available for inspection, local builds and forks. This source release does not deploy the site or activate market execution. It is not an independent security audit or a claim that this tree matches the currently deployed service.

GRN1 format and standalone record inspection remain available in [docs/GRN1.md](docs/GRN1.md), [docs/VERIFICATION.md](docs/VERIFICATION.md) and `npm run read:record -- --tx TRANSACTION_HASH`.

## What is not included

This is **not** a complete, self-hostable copy of grainpad.fun. A local build includes the reviewed site and launch forms. Several production services and routes are not here.

**Operator services and their data**
- Signing, payment execution, tax collection, conversion, publication and indexing services, with their journals and the scheduled jobs that drive them.
- `worker.ts` still calls the protected indexer route, which is not part of this export.

**Routes that depend on those services** (absent from the build)

| Route | Purpose |
| --- | --- |
| `/api/launches` | Launch registration |
| `/api/monero-prelaunch` | Monero pre-launch |
| `/token/[mint]` | Token page |
| `/token/[mint]/receipt` | Receipt page |
| `/api/rpc`, `/api/rpc-session`, `/api/rpc-policy` | Browser RPC relay; it also carries operator flows. Features that read or submit through it need your own RPC relay |

**Routes outside this source release**
- Owner, platform, treasury and rewards administration pages and APIs.
- Holder-reward data APIs.
- Internal and indexer APIs.
- Robinhood registration, market/history APIs and Monero publication services. The exported client forms need separately operated backends for those features. Browser wallet interactions remain explicit user actions.

**Configuration and records**
- Production configuration: RPC endpoints, credentials, D1/R2 bindings, budgets and spending caps.
- Internal operations material: records, reports and operating history.

`lib/rpc-budget.mjs` is a packaging substitution. It contains the same validation and atomic allocation as production (the shared core is `lib/rpc-budget-core.mjs`), but uses **example caps** for local builds and tests. A deployment must set every `RPC_*` cap itself.

## Network source and readiness

`lib/chain/` contains network identities, wallet boundaries, recovery, Robinhood client builders and read-only EVM onboarding tools. `contracts/src/` contains the Robinhood contracts, with vendored OpenZeppelin sources and contract tests. The Base, Ethereum and BNB templates are preparation work, not enabled network launches. Source availability alone does not verify a live deployment or complete operational readiness.

Run `node scripts/chain-onboarding.mjs --template base` for an offline plan. The optional RPC inspection mode only reads chain data. Solidity tests use Foundry with Solidity 0.8.28: `forge test --root contracts`. Fork tests need an explicitly configured public RPC; they are separate from the offline Node suite.

## Revenue split

For future rewards sources, the split is 50% to eligible holders, 15% to GRAIN buy-and-burn and 35% to the platform. Existing sources keep their original entitlements and splits. This describes policy. It does not show that collection, conversion, buybacks, burns or payments are running, and it promises no yield.

## Use

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run verify:public
npm run build
```

Tests use generated disposable keys and mocked or local data, and move no funds. A local build runs without production services; features that need them are unavailable.

Licensed GPL-3.0-only; see LICENSE. Dependencies keep their own licenses.

## Distribution changes

The public RPC budget uses example settings instead of production settings. Public packaging includes a standalone lockfile, verification inventory and release instructions. The source-footer label is adapted for public access. These changes do not alter the private production application.
