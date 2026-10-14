import { z } from 'zod';

const sourceCommit = z.string().regex(/^[a-f0-9]{40}$/);
const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/).refine(value => !/^0x0{40}$/i.test(value), 'Zero address is not a deployment');
const codeHash = z.string().regex(/^0x[a-f0-9]{64}$/).refine(value => !/^0x0{64}$/.test(value), 'Missing runtime code hash');
const uint256 = z.string().regex(/^[1-9][0-9]{0,77}$/).refine(value => /^[1-9][0-9]{0,77}$/.test(value) && BigInt(value) < (1n << 256n), 'Exceeds uint256');
const approvalId = z.string().min(1).max(128).regex(/^[a-zA-Z0-9:_-]+$/);
const contractPin = z.object({ address, runtimeCodeHash: codeHash, sourceCommit }).strict();
const httpsSource = z.string().url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
}, 'Use a public HTTPS primary source without credentials or query parameters');

/** Source candidates only. Parsing or an approval identifier does not attest deployment or grant execution. */
export const evmNetworkManifestSchema = z.object({
  schemaVersion: z.literal(1),
  family: z.literal('evm'),
  slug: z.string().regex(/^[a-z][a-z0-9-]{1,47}$/),
  name: z.string().min(1).max(80),
  chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  environment: z.enum(['mainnet', 'testnet']),
  nativeCurrency: z.object({ name: z.string().min(1).max(40), symbol: z.string().regex(/^[A-Z][A-Z0-9]{1,11}$/), decimals: z.literal(18) }).strict(),
  officialSources: z.array(httpsSource).min(1).max(8),
  rpcSecretName: z.string().regex(/^[A-Z][A-Z0-9_]{1,79}_RPC_URL$/),
  moneroRegistration: z.literal('required'),
  deployment: z.object({
    sourceCommit,
    contracts: z.object({ factory: contractPin, curve: contractPin, vault: contractPin, wrappedNative: contractPin,
      dexFactory: contractPin, positionManager: contractPin, router: contractPin, quoter: contractPin }).strict(),
  }).strict().nullable(),
  platformRecipient: address.nullable(),
  dexPolicy: z.object({ adapter: z.literal('uniswap-v3'), poolFeePips: z.number().int().positive().max(1000000), tickSpacing: z.number().int().positive().max(887272) }).strict().nullable(),
  feePolicy: z.object({ platformBps: z.number().int().min(0).max(10000), creatorBps: z.number().int().min(0).max(10000),
    tradeBps: z.number().int().min(0).max(10000), approvalId }).strict().refine(fee => fee.platformBps + fee.creatorBps + fee.tradeBps < 10000, 'Fees must leave a positive net trade amount').nullable(),
  economics: z.object({ totalSupply: uint256, saleInventory: uint256, liquidityReserve: uint256,
    virtualQuote: uint256, virtualToken: uint256, graduationQuote: uint256, approvalId }).strict()
    .refine(value => [value.saleInventory, value.liquidityReserve, value.totalSupply].every(part => /^[1-9][0-9]{0,77}$/.test(part)) && BigInt(value.saleInventory) + BigInt(value.liquidityReserve) === BigInt(value.totalSupply), 'Inventory and liquidity reserve must equal supply').nullable(),
}).strict();

export type EvmNetworkManifest = z.infer<typeof evmNetworkManifestSchema>;

export function validateEvmNetworkManifest(value: unknown): EvmNetworkManifest {
  return evmNetworkManifestSchema.parse(value);
}

function freezeManifest(manifest: EvmNetworkManifest): Readonly<EvmNetworkManifest> {
  Object.freeze(manifest.nativeCurrency);
  Object.freeze(manifest.officialSources);
  if (manifest.deployment) {
    for (const pin of Object.values(manifest.deployment.contracts)) Object.freeze(pin);
    Object.freeze(manifest.deployment.contracts);
    Object.freeze(manifest.deployment);
  }
  if (manifest.dexPolicy) Object.freeze(manifest.dexPolicy);
  if (manifest.feePolicy) Object.freeze(manifest.feePolicy);
  if (manifest.economics) Object.freeze(manifest.economics);
  return Object.freeze(manifest);
}

/** These templates have no deployed contracts, approved economics, or executable adapter. */
export const EVM_NETWORK_TEMPLATES = Object.freeze([
  { slug: 'base', name: 'Base', chainId: 8453, symbol: 'ETH', currency: 'Ether',
    source: 'https://docs.base.org/get-started/connect-to-base', secret: 'BASE_MAINNET_RPC_URL' },
  { slug: 'ethereum', name: 'Ethereum Mainnet', chainId: 1, symbol: 'ETH', currency: 'Ether',
    source: 'https://eips.ethereum.org/EIPS/eip-2228', secret: 'ETHEREUM_MAINNET_RPC_URL' },
  { slug: 'bnb', name: 'BNB Smart Chain', chainId: 56, symbol: 'BNB', currency: 'BNB',
    source: 'https://docs.bnbchain.org/bnb-smart-chain/faq/tokens-not-showing-in-wallet/', secret: 'BNB_MAINNET_RPC_URL' },
].map(template => freezeManifest(validateEvmNetworkManifest({
  schemaVersion: 1, family: 'evm', slug: template.slug, name: template.name, chainId: template.chainId,
  environment: 'mainnet', nativeCurrency: { name: template.currency, symbol: template.symbol, decimals: 18 },
  officialSources: [template.source], rpcSecretName: template.secret, moneroRegistration: 'required',
  deployment: null, platformRecipient: null, dexPolicy: null, feePolicy: null, economics: null,
}))));

export function getEvmNetworkTemplate(slug: string): Readonly<EvmNetworkManifest> | null {
  return EVM_NETWORK_TEMPLATES.find(network => network.slug === slug) ?? null;
}

export function evmChainNamespace(chainId: number): `eip155:${number}` {
  if (!Number.isSafeInteger(chainId) || chainId < 1) throw new Error('Invalid EVM chain ID');
  return `eip155:${chainId}`;
}

/** The same address on two chains is two different assets; testnet identities are also chain-bound. */
export function evmTokenIdentity(chainId: number, tokenAddress: string): string {
  return `${evmChainNamespace(chainId)}:${address.parse(tokenAddress).toLowerCase()}`;
}

export type EvmOnboardingStep = 'approve-policy' | 'verify-contracts' | 'configure-rpc' | 'verify-finalized-history'
  | 'verify-monero-registration' | 'review-adapter' | 'release-source';

/** Pure planning API. Candidate completeness cannot become a runtime admission decision. */
export function getEvmOnboardingPlan(input: unknown): {
  namespace: string; configurationComplete: boolean; executable: false; steps: EvmOnboardingStep[];
} {
  const manifest = validateEvmNetworkManifest(input);
  const steps: EvmOnboardingStep[] = [];
  if (!manifest.feePolicy || !manifest.economics || !manifest.platformRecipient || !manifest.dexPolicy) steps.push('approve-policy');
  if (!manifest.deployment) steps.push('verify-contracts');
  steps.push('configure-rpc', 'verify-finalized-history', 'verify-monero-registration', 'review-adapter', 'release-source');
  return { namespace: evmChainNamespace(manifest.chainId), configurationComplete: !!(manifest.feePolicy && manifest.economics && manifest.deployment && manifest.platformRecipient && manifest.dexPolicy), executable: false, steps };
}

/** Source-owned admission only. No environment flag, uploaded JSON or client object enables these candidates. */
export function requireExecutableEvmNetwork(slug: string): never {
  if (!getEvmNetworkTemplate(slug)) throw new Error('Unknown EVM network');
  throw new Error('Network onboarding is incomplete: reviewed adapter, verified deployment, approved policy, RPC and mandatory Monero registration are required');
}

/** Batch onboarding rejects ambiguous identity aliases. */
export function validateEvmNetworkCandidates(values: unknown[]): EvmNetworkManifest[] {
  const manifests = values.map(validateEvmNetworkManifest);
  const chains = new Set<number>();
  const slugs = new Set<string>();
  for (const manifest of manifests) {
    if (chains.has(manifest.chainId) || slugs.has(manifest.slug)) throw new Error('Duplicate EVM network identity');
    chains.add(manifest.chainId);
    slugs.add(manifest.slug);
  }
  return manifests;
}
