import {isOwnPlatform} from './launch-identity.mjs';
import type {Network} from "./site-config";

export type LaunchRecord = {
  mint: string; pool: string; name: string; symbol: string; image: string;
  network: Network; createdAt: string; verification: "confirmed-on-chain";
  quoteAsset?:string;quoteMint?:string;quoteDecimals?:number;platformName?: string; platformId: string; official?: boolean;
};

// Walk every storage page before sorting: object keys are mint addresses, not dates.
export async function readLaunchRecords(storage: R2Bucket, network: Network, platformId: string): Promise<LaunchRecord[]> {
  const records: LaunchRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await storage.list({prefix: `launches/${network}/`, limit: 1000, cursor});
    for (let i = 0; i < page.objects.length; i += 20) {
      const rows = await Promise.all(page.objects.slice(i, i + 20).map(async object => {
        const stored = await storage.get(object.key);
        if (!stored) return null;
        const row = JSON.parse(await stored.text()) as LaunchRecord;
        return isOwnPlatform(row.platformId,platformId) && row.network === network && row.verification === "confirmed-on-chain"
          && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(row.mint)
          && typeof row.name === "string" && typeof row.symbol === "string"
          && Number.isFinite(Date.parse(row.createdAt)) ? row : null;
      }));
      for (const row of rows) if (row) records.push(row);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return records.sort((a,b) => b.createdAt.localeCompare(a.createdAt) || a.mint.localeCompare(b.mint));
}

export function launchPage(rows: LaunchRecord[], cursor: string | null) {
  const index = cursor ? rows.findIndex(row => row.mint === cursor) : -1;
  if (cursor && index < 0) throw Error("This directory page is no longer available. Refresh the directory.");
  const launches = rows.slice(index + 1, index + 31);
  return {launches, total: rows.length, nextCursor: index + 31 < rows.length ? launches.at(-1)!.mint : null};
}
