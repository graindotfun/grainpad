/** Dedicated v1 admin. Changing admin derives a new PlatformConfig. */
const ADMIN='FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM';
// Owner authorized wallet review for 1b only on 2026-09-29. The owner signs;
// agents never submit. 1a and token creation remain closed.
export const PLATFORM_SIGNING_STEP='1b';
export const TOKEN_CREATION_ENABLED=false;
export function setupSigningEnabled(step){return step==='1b'&&step===PLATFORM_SIGNING_STEP;}
export function assertTokenCreationEnabled(){if(!TOKEN_CREATION_ENABLED)throw Error('Token creation is locked pending separate approval.');}
export const PLATFORM_SETTINGS={admin:ADMIN,feeWallet:ADMIN,feeKeyWallet:ADMIN,vestingWallet:ADMIN,founder:ADMIN,authorityModel:'single-founder-key',walletProvenance:'Dedicated admin wallet funded from the founder’s personal trading wallet.',planned:'squads-multisig+timelock'};
