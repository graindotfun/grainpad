export const MINT_SUFFIX = "grain";
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const modulus = 58 ** MINT_SUFFIX.length;
const target = [...MINT_SUFFIX].reduce((value, char) => value * 58 + alphabet.indexOf(char), 0);

// Last base58 digits of the big-endian public key. All intermediate values are exact JS integers.
export function hasMintSuffix(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  return bytes.reduce((value, byte) => (value * 256 + byte) % modulus, 0) === target;
}

export function assertMintSuffix(address: string): void {
  if (!address.endsWith(MINT_SUFFIX)) throw Error("Every launch through Grainpad requires a lowercase grain mint address.");
}
