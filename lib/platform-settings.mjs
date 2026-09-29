/** Dedicated v1 admin. Changing admin derives a new PlatformConfig. */
const ADMIN='FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM';
// Hot-key 1b signing is closed. 1b is on-chain activation and needs a separate owner approval. Token creation stays locked.
export const PLATFORM_SIGNING_STEP=null;
export const TOKEN_CREATION_ENABLED=false;
export function setupSigningEnabled(_step){void _step;return false;}
export function assertTokenCreationEnabled(){if(!TOKEN_CREATION_ENABLED)throw Error('Token creation is locked pending separate approval.');}
export const PLATFORM_SETTINGS={admin:ADMIN,feeWallet:ADMIN,feeKeyWallet:ADMIN,vestingWallet:ADMIN,founder:ADMIN,authorityModel:'single-founder-key',walletProvenance:'Dedicated admin wallet funded from the founder’s personal trading wallet.',planned:'squads-multisig+timelock'};
