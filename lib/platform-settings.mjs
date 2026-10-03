import {assertHolderRewardsOperational} from './rewards-policy.mjs';
/** Dedicated v1 admin. Changing admin derives a new PlatformConfig. */
const ADMIN='FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM';
// These independently pinned roles currently share the owner address. A reviewed
// claim-only handoff must never redirect already assigned tax revenue.
export const PLATFORM_CLAIM_AUTHORITY=ADMIN;
export const PLATFORM_REVENUE_RECIPIENT=ADMIN;
// FeeKey custody remains founder-pinned until the separately reviewed handoff finalizes.
export const PLATFORM_FEEKEY_AUTHORITY=ADMIN;
// Legacy setup 1b (untaxed SOL/wXMR admission) is SUPERSEDED — DO NOT SIGN. There is no flag that reopens it:
// the only setup path is the rewards setup (docs/release/SETUP_PATH.md). 1a is already finalized.
export const LEGACY_SETUP='superseded-do-not-sign';
export const TOKEN_CREATION_ENABLED=false;
export function setupSigningEnabled(){return false;}
export function assertTokenCreationEnabled(){if(!TOKEN_CREATION_ENABLED)throw Error('Token creation is locked pending separate approval.');assertHolderRewardsOperational();}
export const PLATFORM_SETTINGS={admin:ADMIN,claimAuthority:PLATFORM_CLAIM_AUTHORITY,revenueRecipient:PLATFORM_REVENUE_RECIPIENT,feeWallet:PLATFORM_CLAIM_AUTHORITY,feeKeyWallet:PLATFORM_FEEKEY_AUTHORITY,vestingWallet:ADMIN,founder:ADMIN,authorityModel:'single-founder-key',walletProvenance:'Dedicated admin wallet funded from the founder’s personal trading wallet.',planned:'squads-multisig+timelock'};
