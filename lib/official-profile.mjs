/** Public-profile branding only; this confers no platform or transaction authority. */
export const OFFICIAL_PROFILE_WALLET='8A6UdaWWvHnRBGYiJyyiGYyVzSN43dJRCfQx6eJqBJSz';
export function isOfficialProfile(identity){return identity?.wallet===OFFICIAL_PROFILE_WALLET&&identity?.username==='grainpad';}
