import {assertHolderRewardsOperational} from './rewards-policy.mjs';
/** Dedicated v1 admin. Changing admin derives a new PlatformConfig. */
const ADMIN='FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM';
// Finalized combined custody handoff: collector claims fees; the founder keeps
// revenue, admin and vesting. Source pins accept only the finalized collector.
export const PLATFORM_CLAIM_AUTHORITY='BxJZSApDy7i4VVAQSRCL5FQJ2RCCP676PUWKYEcY1Z6i';
export const PLATFORM_REVENUE_RECIPIENT=ADMIN;
// Future FeeKey custody finalized to the same collector; LP principal remains locked.
export const PLATFORM_FEEKEY_AUTHORITY='BxJZSApDy7i4VVAQSRCL5FQJ2RCCP676PUWKYEcY1Z6i';
// Legacy setup 1b (untaxed SOL/wXMR admission) is SUPERSEDED — DO NOT SIGN. There is no flag that reopens it:
// the only setup path is the rewards setup (docs/release/SETUP_PATH.md). 1a is already finalized.
export const LEGACY_SETUP='superseded-do-not-sign';
export const TOKEN_CREATION_ENABLED=false;
export function setupSigningEnabled(){return false;}
export function assertTokenCreationEnabled(){if(!TOKEN_CREATION_ENABLED)throw Error('Token creation is locked pending separate approval.');assertHolderRewardsOperational();}
export const PLATFORM_SETTINGS={admin:ADMIN,claimAuthority:PLATFORM_CLAIM_AUTHORITY,revenueRecipient:PLATFORM_REVENUE_RECIPIENT,feeWallet:PLATFORM_CLAIM_AUTHORITY,feeKeyWallet:PLATFORM_FEEKEY_AUTHORITY,vestingWallet:ADMIN,founder:ADMIN,authorityModel:'single-founder-key',walletProvenance:'Dedicated admin wallet funded from the founder’s personal trading wallet.',planned:'squads-multisig+timelock'};
