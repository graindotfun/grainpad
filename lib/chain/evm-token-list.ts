/**
 * Uniswap-token-list-schema document of admitted Grainpad launches (https://tokenlists.org). A standards-based source that
 * wallets, interfaces and aggregators can subscribe to or import. Publication is an implementation fact, NOT proof that any
 * provider ingests it: record provider acceptance separately (see MetadataDiscoveryStatus).
 */
export type TokenListInput = {chainId: number; address: string; name: string; symbol: string; image: string | null};
export type TokenList = {
  name: string; timestamp: string; version: {major: number; minor: number; patch: number}; keywords: string[]; logoURI?: string;
  tokens: Array<{chainId: number; address: string; name: string; symbol: string; decimals: 18; logoURI: string}>;
};
// Constraints from the published token-list JSON schema.
const NAME = /^[ \w.'+\-%/À-ÖØ-öø-ÿ:&[\]()]+$/, SYMBOL = /^[^\s]+$/;

export function buildTokenList(tokens: TokenListInput[], opts: {name: string; timestamp: string; version: TokenList["version"]; logoURI?: string}): TokenList {
  const seen = new Set<string>();
  const entries = tokens.flatMap(t => {
    const address = t.address.toLowerCase();
    // Skip, never rewrite, anything the schema cannot represent. A token list must not display a name that differs from the contract.
    if (!/^0x[0-9a-f]{40}$/.test(address) || seen.has(t.chainId + ":" + address) || !t.image || !t.image.startsWith("https://")) return [];
    if (t.name.length > 40 || t.symbol.length > 20 || !NAME.test(t.name) || !SYMBOL.test(t.symbol)) return [];
    seen.add(t.chainId + ":" + address);
    return [{chainId: t.chainId, address, name: t.name, symbol: t.symbol, decimals: 18 as const, logoURI: t.image}];
  }).sort((a, b) => a.address < b.address ? -1 : 1);
  return {name: opts.name, timestamp: opts.timestamp, version: opts.version, keywords: ["grainpad", "launchpad"], ...(opts.logoURI ? {logoURI: opts.logoURI} : {}), tokens: entries};
}

// ---------------------------------------------------------------------------------------------------------------
// Admitted-launch index: written once when a launch is admitted, so listing costs R2 list calls only (no chain or database
// reads per request) and is complete rather than "the first N registrations".
// ---------------------------------------------------------------------------------------------------------------
export type AdmittedStore = {
  put(key: string, value: string, options?: {customMetadata?: Record<string, string>}): Promise<unknown>;
  list(options: {prefix: string; limit: number; cursor?: string; include?: string[]}): Promise<{objects: Array<{key: string; customMetadata?: Record<string, string>}>; truncated: boolean; cursor?: string}>;
};
export const admittedPrefix = (chainId: number, factory: string) => `robinhood-v2-admitted/${chainId}/${factory.toLowerCase()}/`;

export async function recordAdmittedToken(store: AdmittedStore, chainId: number, factory: string, token: TokenListInput) {
  if (!token.image || token.image.length > 300 || token.name.length > 100 || token.symbol.length > 40) return;
  await store.put(admittedPrefix(chainId, factory) + token.address.toLowerCase(), "1", {customMetadata: {name: token.name, symbol: token.symbol, image: token.image}});
}

/** Walks every page up to `maxTokens`. `truncated` tells the caller to serve a further page via `cursor`. */
export async function collectAdmittedTokens(store: AdmittedStore, chainId: number, factory: string, opts: {maxTokens?: number; pageSize?: number; cursor?: string} = {}) {
  const prefix = admittedPrefix(chainId, factory), maxTokens = opts.maxTokens ?? 5000, pageSize = Math.min(opts.pageSize ?? 1000, 1000);
  const tokens: TokenListInput[] = [];
  let cursor = opts.cursor, truncated = false;
  do {
    const page = await store.list({prefix, limit: Math.min(pageSize, maxTokens - tokens.length), ...(cursor ? {cursor} : {}), include: ["customMetadata"]});
    for (const object of page.objects) {
      const meta = object.customMetadata;
      if (meta?.name && meta.symbol) tokens.push({chainId, address: object.key.slice(prefix.length), name: meta.name, symbol: meta.symbol, image: meta.image ?? null});
    }
    cursor = page.truncated ? page.cursor : undefined;
    if (cursor && tokens.length >= maxTokens) { truncated = true; break; }
  } while (cursor);
  return {tokens, truncated, cursor: truncated ? cursor : undefined};
}

/** A bounded page across retained generations. Old raw R2 cursors continue in the first (legacy) factory. */
export async function collectAdmittedFactoryTokens(store: AdmittedStore, chainId: number, factories: string[], opts: {maxTokens?: number; cursor?: string} = {}) {
  const unique = [...new Set(factories.map(f => f.toLowerCase()))];
  if (!unique.length || unique.length > 8 || unique.some(f => !/^0x[0-9a-f]{40}$/.test(f))) throw Error("Invalid factory registry.");
  let index = 0, cursor = opts.cursor;
  if (cursor?.startsWith("gp2.")) {
    let value: {factory: string; cursor?: string};
    try { value = JSON.parse(atob(cursor.slice(4))); } catch { throw Error("Invalid cursor."); }
    index = unique.indexOf(value.factory);
    if (index < 0 || (value.cursor !== undefined && typeof value.cursor !== "string")) throw Error("Invalid cursor.");
    cursor = value.cursor;
  }
  const maxTokens = opts.maxTokens ?? 5000, tokens: TokenListInput[] = [];
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 5000) throw Error("Invalid page size.");
  let reads = 0;
  const bounded = {...store, list: async (options: Parameters<AdmittedStore["list"]>[0]) => {
    if (++reads > 12) throw Error("Token-list read budget exceeded.");
    return store.list(options);
  }};
  for (; index < unique.length; index++) {
    const page = await collectAdmittedTokens(bounded, chainId, unique[index], {maxTokens: maxTokens - tokens.length, cursor});
    tokens.push(...page.tokens);
    cursor = undefined;
    if (page.truncated || (tokens.length >= maxTokens && index + 1 < unique.length)) {
      const next = page.truncated ? {factory: unique[index], cursor: page.cursor} : {factory: unique[index + 1]};
      return {tokens, truncated: true, cursor: "gp2." + btoa(JSON.stringify(next))};
    }
  }
  return {tokens, truncated: false, cursor: undefined};
}
