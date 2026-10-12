/** Public launch branding and the separately approved official identity. */
export const MINT_SUFFIX = "grn";
export const OFFICIAL_MINT_SUFFIX = "grain";
export type MintSuffix = typeof MINT_SUFFIX | typeof OFFICIAL_MINT_SUFFIX;
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
// Last base58 digits of the big-endian public key. Arithmetic remains exact.
export function hasMintSuffix(bytes: Uint8Array, suffix: MintSuffix = MINT_SUFFIX): boolean {
  if(bytes.length!==32||![MINT_SUFFIX,OFFICIAL_MINT_SUFFIX].includes(suffix))return false;
  const modulus=58**suffix.length,target=[...suffix].reduce((value,char)=>value*58+alphabet.indexOf(char),0);
  return bytes.reduce((value,byte)=>(value*256+byte)%modulus,0)===target;
}
export function assertMintSuffix(address: string): void {
  if(!address.endsWith(MINT_SUFFIX))throw Error("Every public launch through Grainpad requires a lowercase grn mint address.");
}
export function assertOfficialMintSuffix(address: string): void {
  if(!address.endsWith(OFFICIAL_MINT_SUFFIX))throw Error("Official GRAIN requires a lowercase grain mint address.");
}
