import {assertHolderRewardsOperational} from './rewards-policy.mjs';
/** Dedicated v1 admin. Changing admin derives a new PlatformConfig. */
const ADMIN='FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM';
// The earlier approval covered legacy, untaxed 1b. The rewards transition needs
// a new exact review; that approval must not activate the superseded policy.
export const PLATFORM_SIGNING_STEP=null;
export const TOKEN_CREATION_ENABLED=false;
export function setupSigningEnabled(step){return step==='1b'&&step===PLATFORM_SIGNING_STEP;}
export function assertTokenCreationEnabled(){if(!TOKEN_CREATION_ENABLED)throw Error('Token creation is locked pending separate approval.');assertHolderRewardsOperational();}
export const PLATFORM_SETTINGS={admin:ADMIN,feeWallet:ADMIN,feeKeyWallet:ADMIN,vestingWallet:ADMIN,founder:ADMIN,authorityModel:'single-founder-key',walletProvenance:'Dedicated admin wallet funded from the founder’s personal trading wallet.',planned:'squads-multisig+timelock'};
