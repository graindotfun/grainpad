import {keccak_256} from "@noble/hashes/sha3";
import {evmAddress, evmChainHex} from "./evm-transaction-safety.ts";
import {validateEvmNetworkManifest, type EvmNetworkManifest} from "./evm-network-manifest.ts";
import {inspectEvmDexContractCandidate} from "./evm-network-contracts.ts";

type Pin = Readonly<{address: string; runtimeCodeHash: string; sourceCommit: string}>;
export type EvmOnboardingCandidate = EvmNetworkManifest;
export type EvmReadOnlyRpc = (method: "eth_chainId" | "eth_getBlockByNumber" | "eth_getCode" | "eth_call", params: unknown[]) => Promise<unknown>;
export type EvmOnboardingReport = Readonly<{
  schemaVersion: 1;
  namespace: string;
  sourceCommit: string | null;
  observedFinalizedBlock: string | null;
  onchainChecksPassed: boolean;
  executable: false;
  checks: ReadonlyArray<Readonly<{check: string; passed: boolean}>>;
  remainingGates: readonly string[];
}>;
const utf8 = new TextEncoder();
function hex(value: Uint8Array): string { return [...value].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
function selector(signature: string): string { return `0x${hex(keccak_256(utf8.encode(signature))).slice(0, 8)}`; }
function word(value: unknown): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/i.test(value)) throw new Error("Malformed ABI response.");
  return BigInt(value);
}
function block(value: unknown): {number: string; hash: string} {
  if (!value || typeof value !== "object" || !("number" in value) || !("hash" in value) || typeof value.number !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value.number) || typeof value.hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(value.hash)) throw new Error("Provider returned no finalized block.");
  return {number: value.number, hash: value.hash.toLowerCase()};
}
/**
 * Read-only source candidate inspection for the Grain curve ABI, not a release gate.
 * Other factory/DEX ABIs require a separate reviewed adapter, not arbitrary getters.
 * RPC errors are deliberately omitted from the report: they can contain credentials.
 */
export async function inspectEvmOnboarding(input: unknown, rpc: EvmReadOnlyRpc): Promise<EvmOnboardingReport> {
  const candidate = validateEvmNetworkManifest(input);
  const chainHex = evmChainHex(candidate.chainId);
  const checks: {check: string; passed: boolean}[] = [];
  let observedFinalizedBlock: string | null = null;
  const check = async (name: string, run: () => Promise<boolean>) => {
    try { checks.push({check: name, passed: await run()}); }
    catch { checks.push({check: name, passed: false}); }
  };
  const remainingGates = ["Independent review of this exact source candidate", "Owner-approved provider billing and archive/finalized RPC capability", "Mandatory Monero registration: real adapter, publication budget and confirmed receipt", "Real-contract graduation and wallet acceptance", "Explicit reviewed source-owned registry pin and production release verification"];
  const configured = candidate.moneroRegistration === "required" && candidate.deployment !== null && candidate.feePolicy !== null && candidate.economics !== null && candidate.platformRecipient !== null && candidate.dexPolicy !== null;
  if (!configured) {
    return {schemaVersion: 1, namespace: `eip155:${candidate.chainId}`, sourceCommit: candidate.deployment?.sourceCommit ?? null, observedFinalizedBlock, onchainChecksPassed: false, executable: false, checks: [{check: "deployment-fee-economics-Monero-configured", passed: false}], remainingGates};
  }
  const deployment = candidate.deployment!, fee = candidate.feePolicy!, economics = candidate.economics!;
  // A completeness report cannot turn unapproved inputs into a signing authorization.
  await check("approval-and-source-identities", async () => /^[0-9a-f]{40}$/i.test(deployment.sourceCommit) && fee.approvalId.trim().length > 0 && economics.approvalId.trim().length > 0 && Object.values(deployment.contracts).every(pin => /^[0-9a-f]{40}$/i.test(pin.sourceCommit) && /^0x[0-9a-f]{64}$/i.test(pin.runtimeCodeHash)));
  await check("supported-generic-curve-profile", async () => fee.tradeBps === 0 && fee.platformBps + fee.creatorBps > 0 && fee.platformBps + fee.creatorBps <= 1000 && candidate.dexPolicy?.adapter === "uniswap-v3" && Object.entries(economics).filter(([key]) => key !== "approvalId").every(([, value]) => BigInt(value) < (1n << 128n)));
  if (checks.some(item => !item.passed)) return {schemaVersion: 1, namespace: `eip155:${candidate.chainId}`, sourceCommit: deployment.sourceCommit, observedFinalizedBlock, onchainChecksPassed: false, executable: false, checks, remainingGates};
  await check("RPC-chain-before", async () => {
    const chain = await rpc("eth_chainId", []);
    return typeof chain === "string" && /^0x[0-9a-f]+$/i.test(chain) && BigInt(chain) === BigInt(chainHex);
  });
  if (checks.some(item => !item.passed)) return {schemaVersion: 1, namespace: `eip155:${candidate.chainId}`, sourceCommit: deployment.sourceCommit, observedFinalizedBlock, onchainChecksPassed: false, executable: false, checks, remainingGates};
  let finalized: {number: string; hash: string};
  try { finalized = block(await rpc("eth_getBlockByNumber", ["finalized", false])); observedFinalizedBlock = finalized.number; }
  catch { checks.push({check: "finalized-block", passed: false}); return {schemaVersion: 1, namespace: `eip155:${candidate.chainId}`, sourceCommit: deployment.sourceCommit, observedFinalizedBlock, onchainChecksPassed: false, executable: false, checks, remainingGates}; }
  const call = async (pin: Pin, signature: string) => word(await rpc("eth_call", [{to: evmAddress(pin.address), data: selector(signature)}, finalized.number]));
  for (const [name, pin] of Object.entries(deployment.contracts)) {
    await check(`${name}-runtime-code-hash`, async () => {
      const code = await rpc("eth_getCode", [evmAddress(pin.address), finalized.number]);
      if (typeof code !== "string" || !/^0x(?:[0-9a-f]{2})+$/i.test(code)) return false;
      const bytes = Uint8Array.from(code.slice(2).match(/../g)!, value => parseInt(value, 16));
      return `0x${hex(keccak_256(bytes))}` === pin.runtimeCodeHash.toLowerCase();
    });
  }
  const pins = deployment.contracts;
  const addressChecks: [Pin, string, string][] = [
    [pins.factory, "curve()", pins.curve.address], [pins.factory, "vault()", pins.vault.address],
    [pins.curve, "factory()", pins.factory.address], [pins.curve, "vault()", pins.vault.address],
    [pins.curve, "quote()", pins.wrappedNative.address], [pins.curve, "DEX_FACTORY()", pins.dexFactory.address],
    [pins.curve, "POSITION_MANAGER()", pins.positionManager.address], [pins.vault, "curve()", pins.curve.address],
    [pins.vault, "quote()", pins.wrappedNative.address], [pins.positionManager, "factory()", pins.dexFactory.address],
  ];
  for (const [pin, signature, expected] of addressChecks) await check(`${evmAddress(pin.address)}-${signature}`, async () => await call(pin, signature) === BigInt(evmAddress(expected)));
  const numericChecks: [Pin, string, bigint][] = [
    [pins.wrappedNative, "decimals()", 18n], [pins.factory, "totalSupply()", BigInt(economics.totalSupply)],
    [pins.factory, "saleSupply()", BigInt(economics.saleInventory)], [pins.curve, "liquiditySupply()", BigInt(economics.liquidityReserve)],
    [pins.curve, "virtualQuote()", BigInt(economics.virtualQuote)], [pins.curve, "virtualToken()", BigInt(economics.virtualToken)],
    [pins.curve, "graduationQuote()", BigInt(economics.graduationQuote)], [pins.curve, "platformFeeBps()", BigInt(fee.platformBps)],
    [pins.curve, "creatorFeeBps()", BigInt(fee.creatorBps)], [pins.curve, "tradeFeeBps()", BigInt(fee.tradeBps)],
  ];
  for (const [pin, signature, expected] of numericChecks) await check(`${evmAddress(pin.address)}-${signature}`, async () => await call(pin, signature) === expected);
  await check("platform-and-DEX-approved-bindings", async () => {
    const report = await inspectEvmDexContractCandidate((method, params) => {
      if (!["eth_chainId", "eth_getBlockByNumber", "eth_getCode", "eth_call"].includes(method)) throw new Error("Read-only RPC method refused.");
      return rpc(method as Parameters<EvmReadOnlyRpc>[0], params);
    }, candidate, finalized);
    return report.dexBindingsMatch;
  });
  await check("finalized-block-remains-canonical", async () => block(await rpc("eth_getBlockByNumber", [finalized.number, false])).hash === finalized.hash);
  await check("RPC-chain-after", async () => { const chain = await rpc("eth_chainId", []); return typeof chain === "string" && /^0x[0-9a-f]+$/i.test(chain) && BigInt(chain) === BigInt(chainHex); });
  return {schemaVersion: 1, namespace: `eip155:${candidate.chainId}`, sourceCommit: deployment.sourceCommit, observedFinalizedBlock, onchainChecksPassed: checks.every(item => item.passed), executable: false, checks, remainingGates};
}
