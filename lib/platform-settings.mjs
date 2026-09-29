/** Dedicated v1 admin. Changing admin derives a new PlatformConfig. */
const ADMIN='FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM';
// Omer's current authorization: guarded 1a only. 1b and ALL token creation remain locked.
export const PLATFORM_SIGNING_STEP='1a';
export const TOKEN_CREATION_ENABLED=false;
export function setupSigningEnabled(step){return step==='1a'&&PLATFORM_SIGNING_STEP==='1a';}
export function assertTokenCreationEnabled(){if(!TOKEN_CREATION_ENABLED)throw Error('Token creation is locked pending separate approval.');}
export const PLATFORM_SETTINGS={admin:ADMIN,feeWallet:ADMIN,feeKeyWallet:ADMIN,vestingWallet:ADMIN,founder:ADMIN,authorityModel:'single-founder-key',walletProvenance:'Dedicated admin wallet funded from the founder’s personal trading wallet.',planned:'squads-multisig+timelock'};
