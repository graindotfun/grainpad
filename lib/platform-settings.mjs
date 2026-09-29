/** Dedicated v1 admin. Changing admin derives a new PlatformConfig. */
const ADMIN='FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM';
// Omer's current authorization: guarded 1b only, after finalized 1a and the reviewed budget pass. ALL token creation remains locked.
export const PLATFORM_SIGNING_STEP='1b';
export const TOKEN_CREATION_ENABLED=false;
export function setupSigningEnabled(step){return step==='1b'&&PLATFORM_SIGNING_STEP==='1b';}
export function assertTokenCreationEnabled(){if(!TOKEN_CREATION_ENABLED)throw Error('Token creation is locked pending separate approval.');}
export const PLATFORM_SETTINGS={admin:ADMIN,feeWallet:ADMIN,feeKeyWallet:ADMIN,vestingWallet:ADMIN,founder:ADMIN,authorityModel:'single-founder-key',walletProvenance:'Dedicated admin wallet funded from the founder’s personal trading wallet.',planned:'squads-multisig+timelock'};
