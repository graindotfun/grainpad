import { keccak_256 } from '@noble/hashes/sha3';
import { validateEvmNetworkManifest } from './evm-network-manifest.ts';

type Rpc = (method: string, params: unknown[]) => Promise<unknown>;
const hash = (value: unknown): string => {
  if (typeof value !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(value)) throw new Error('Invalid block hash');
  return value.toLowerCase();
};
const quantity = (value: unknown): bigint => {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-fA-F][a-fA-F0-9]{0,63})$/.test(value)) throw new Error('Invalid chain quantity');
  return BigInt(value);
};
const word = (value: unknown): bigint => {
  if (typeof value !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(value)) throw new Error('Invalid contract word');
  return BigInt(value);
};
const addressWord = (value: unknown): string => {
  const integer = word(value);
  if (integer === 0n || integer >= 1n << 160n) throw new Error('Invalid contract address word');
  return `0x${integer.toString(16).padStart(40, '0')}`;
};
const selector = (signature: string): string => `0x${Buffer.from(keccak_256(new TextEncoder().encode(signature))).toString('hex').slice(0,8)}`;
const readBlock = (value: unknown): {number: string; hash: string} => {
  if (!value || typeof value !== 'object' || !('number' in value) || !('hash' in value)) throw new Error('Finalized block unavailable');
  const number = `0x${quantity(value.number).toString(16)}`;
  return {number, hash: hash(value.hash)};
};

/** Read-only ABI profile, not a deployed multi-chain adapter. No signer, authorization, or broadcast. */
export async function inspectEvmDexContractCandidate(rpc: Rpc, input: unknown, existingAnchor?: {number: string; hash: string}): Promise<{
  chainId: number; block: string; blockHash: string; dexBindingsMatch: true;
  executionAllowed: false; remaining: string[];
}> {
  const manifest = validateEvmNetworkManifest(input);
  if (!manifest.deployment || !manifest.feePolicy || !manifest.economics || !manifest.platformRecipient || !manifest.dexPolicy) {
    throw new Error('Complete deployment, recipient, DEX and approved policy candidate required');
  }
  if (quantity(await rpc('eth_chainId', [])) !== BigInt(manifest.chainId)) throw new Error('Inspection chain differs');
  const finalized = readBlock(await rpc('eth_getBlockByNumber', ['finalized', false]));
  const anchor = existingAnchor ? readBlock(existingAnchor) : finalized;
  if (quantity(anchor.number) > quantity(finalized.number) || readBlock(await rpc('eth_getBlockByNumber', [anchor.number, false])).hash !== anchor.hash) throw new Error('Inspection anchor is not canonical and finalized');
  const contracts = manifest.deployment.contracts;
  const call = (target: string, signature: string, args = '') => rpc('eth_call', [{to: target, data: selector(signature) + args}, anchor.number]);
  const c = Object.fromEntries(Object.entries(contracts).map(([key, pin]) => [key, pin.address.toLowerCase()]));
  const bindings: [string, string, string][] = [
    [c.vault,'platform()',manifest.platformRecipient.toLowerCase()],
    [c.curve,'POSITION_MANAGER()',c.positionManager],[c.curve,'DEX_FACTORY()',c.dexFactory],
    [c.positionManager,'factory()',c.dexFactory],[c.positionManager,'WETH9()',c.wrappedNative],
    [c.router,'factoryV3()',c.dexFactory],[c.router,'WETH9()',c.wrappedNative],
    [c.quoter,'factory()',c.dexFactory],[c.quoter,'WETH9()',c.wrappedNative],
  ];
  for (const [target, signature, expected] of bindings) {
    if (addressWord(await call(target, signature)) !== expected) throw new Error(`Deployment binding differs: ${signature}`);
  }
  const tier = manifest.dexPolicy.poolFeePips;
  if (word(await call(c.dexFactory,'feeAmountTickSpacing(uint24)',BigInt(tier).toString(16).padStart(64,'0'))) !== BigInt(manifest.dexPolicy.tickSpacing)) {
    throw new Error('DEX fee tier or tick spacing differs');
  }
  if (readBlock(await rpc('eth_getBlockByNumber',[anchor.number,false])).hash !== anchor.hash ||
    quantity(await rpc('eth_chainId',[])) !== BigInt(manifest.chainId)) throw new Error('Inspection snapshot changed');
  return {chainId: manifest.chainId, block: anchor.number, blockHash: anchor.hash, dexBindingsMatch: true,
    executionAllowed: false, remaining: ['independent-source-review','real-DEX-fork-acceptance','RPC-billing-and-availability','Monero-registration-acceptance','runtime-source-pins-and-curve-policy-inspection','source-owned-admission-and-release']};
}

/** A concrete immutable build specification. Current RH Solidity remains unchanged and cannot consume this spec. */
export function planEvmContractParameterization(input: unknown) {
  const manifest = validateEvmNetworkManifest(input);
  if (!manifest.feePolicy || !manifest.economics || !manifest.platformRecipient || !manifest.dexPolicy || !manifest.deployment) {
    throw new Error('Complete candidate is required for contract parameterization');
  }
  const e = manifest.economics;
  // Existing curve stores these values as uint128; a reusable version must preserve that bound.
  for (const value of [e.totalSupply,e.saleInventory,e.liquidityReserve,e.virtualQuote,e.virtualToken,e.graduationQuote]) {
    if (BigInt(value) >= 1n << 128n) throw new Error('Current curve ABI requires uint128 economics');
  }
  return { executable: false as const, existingRobinhoodBytecodeReusable: false as const,
    immutableInputs: {chainId:manifest.chainId,wrappedNative:manifest.deployment.contracts.wrappedNative.address,
      platformRecipient:manifest.platformRecipient,positionManager:manifest.deployment.contracts.positionManager.address,
      dexFactory:manifest.deployment.contracts.dexFactory.address,feePolicy:manifest.feePolicy,economics:e,dexPolicy:manifest.dexPolicy},
    requiredSourceChanges: [
      'Replace RH chain/quote/fee constants with immutable per-deployment policy; validate chain and positive net fees in constructor.',
      'Pass validated per-chain economics to factory, curve and vault instead of RH approved() constants.',
      'Pass verified DEX factory, position manager, fee tier and spacing to curve and locker; preserve pool-price checks and principal lock.',
      'Preserve creator-bound launchId and fixed supply; derive constructor ABI and fresh artifacts from the reviewed generic source.',
      'Make locker platform/creator entitlement fractions match explicitly approved policy; do not inherit RH 35/65 entitlement automatically.',
    ],
    requiredAcceptance: ['constructor-wrong-chain-and-policy','curve-fee-rounding-and-reserves','automatic-graduation-and-retry','real-DEX-fork-mint-swap-collect','permanent-principal-lock','creator-binding','Monero-publication'],
  };
}
