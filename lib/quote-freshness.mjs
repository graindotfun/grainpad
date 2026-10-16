/** Display-only quote timestamps. Safe for browser and server consumers. */
export const QUOTE_USD_FRESH_MS=60_000;
export const QUOTE_USD_STALE_MS=600_000;
export function quoteFreshness(updatedAt,now=Date.now()){
 const age=now-updatedAt;
 if(!Number.isFinite(age)||age<0)return 'expired';
 if(age<=QUOTE_USD_FRESH_MS)return 'fresh';
 if(age<=QUOTE_USD_STALE_MS)return 'stale';
 return 'expired';
}
