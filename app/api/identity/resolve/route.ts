import {database} from '@/lib/server-owner';
import {fail} from '@/lib/server-utils';
import {consumeRequestBudget} from '@/lib/abuse-budget.mjs';
import {requestClientKey} from '@/lib/client-key.mjs';
import {identityCards} from '@/lib/wallet-identity.mjs';
export const dynamic='force-dynamic';
/** Public display cards only. Missing wallets are omitted; this is not a directory. */
export async function GET(request:Request){
 try{
  const db=database();
  if(!await consumeRequestBudget(db,`identity:resolve:${requestClientKey(request)}`,60))return fail(Error('Too many identity lookups.'),429);
  const wallets=(new URL(request.url).searchParams.get('wallets')||'').split(',').map(wallet=>wallet.trim()).filter(Boolean);
  if(wallets.length<1||wallets.length>32)return fail(Error('Send 1–32 wallet addresses.'),400);
  return Response.json({identities:await identityCards(db,wallets,{limit:32})},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return fail(error);}
}
