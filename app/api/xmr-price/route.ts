import {database} from '@/lib/server-owner';
import {loadXmrUsd} from '@/lib/xmr-usd.mjs';
import {fail} from '@/lib/server-utils';
export const dynamic='force-dynamic';
/** Public, read-only XMR/USD reading for the grainpet wall chart. Bounded shared cache, no financial writes, no keys. */
export async function GET(){try{
 const reading=await loadXmrUsd(database());
 return Response.json(reading,{headers:{'Cache-Control':'public, max-age=30'}});
}catch(error){return fail(error,503);}}
