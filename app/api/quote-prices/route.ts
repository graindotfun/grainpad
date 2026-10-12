import {database} from '@/lib/server-owner';
import {loadQuoteUsd} from '@/lib/quote-usd.mjs';
import {fail} from '@/lib/server-utils';
export const dynamic='force-dynamic';
/** Public price illustrations use the existing bounded shared quote-asset cache. No financial writes. */
export async function GET(){try{
 const prices=await loadQuoteUsd(database());
 const row=(value:typeof prices.SOL)=>value?{price:value.price,updatedAt:value.updatedAt,freshness:value.freshness,source:value.source,note:value.note}:null;
 return Response.json({SOL:row(prices.SOL),wXMR:row(prices.wXMR)},{headers:{'Cache-Control':'public, max-age=30'}});
}catch(error){return fail(error,503);}}
