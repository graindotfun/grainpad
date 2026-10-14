/** Public builders configure their own retired-launch list; operated launch history is private. */
export const RETIRED_EVM_LAUNCHES=Object.freeze([]);
export class RetiredLaunchError extends Error{constructor(){super('This launch was retired and cannot be registered, authorized, published or listed again.');this.name='RetiredLaunchError';}}
export const isRetiredEvmLaunch=(network,token)=>RETIRED_EVM_LAUNCHES.some(r=>r.network===network&&r.token===token?.toLowerCase());
export function assertNotRetiredEvmLaunch(network,token){if(isRetiredEvmLaunch(network,token))throw new RetiredLaunchError();}
export const retiredTokens=network=>RETIRED_EVM_LAUNCHES.filter(r=>r.network===network).map(r=>r.token);
