import {PLATFORM_SETTINGS} from './platform-settings.mjs';
// Creator entitlements. Grainpad's PlatformConfig locks 100% of the migration LP under the platform Fee Key
// (platformScale 1000000, creatorScale 0, burnScale 0; enforced by assertGrainpadPolicy), so locked-LP fees are never creator earnings.
export const CREATOR_FEE_SOURCES=['curve','cpmm'];
export const FEE_KEY_SOURCE='lp';
export const CREATOR_LP_NOTICE=`Locked LP is not a creator earning. At graduation Grainpad locks 100% of the new LP under one platform Fee Key held by ${PLATFORM_SETTINGS.feeKeyWallet.slice(0,4)}…${PLATFORM_SETTINGS.feeKeyWallet.slice(-4)}; creators receive 0% of it and no Fee Key. Creators earn the 0.25% curve creator fee and, after graduation, the 1% CPMM creator fee.`;
export function splitFeeHistory(rows){return {creator:rows.filter(r=>CREATOR_FEE_SOURCES.includes(r.source)),feeKey:rows.filter(r=>r.source===FEE_KEY_SOURCE)};}
