import {database} from '@/lib/server-owner';
import {fail,limitedJSON,sameOrigin} from '@/lib/server-utils';
import {consumeRequestBudget} from '@/lib/abuse-budget.mjs';
import {requestClientKey} from '@/lib/client-key.mjs';
import {applyFame,assertSignedVoter,fameSummary} from '@/lib/wallet-fame.mjs';
export const dynamic='force-dynamic';
/** Public read: the target's score and, for an optional viewer wallet, that wallet's own vote and eligibility. */
export async function GET(request:Request){
 try{
  const db=database(),url=new URL(request.url);
  if(!await consumeRequestBudget(db,`fame:read:${requestClientKey(request)}`,120))return fail(Error('Too many fame requests.'),429);
  const target=url.searchParams.get('target')||'',viewer=url.searchParams.get('viewer')||null;
  return Response.json(await fameSummary(db,target,viewer),{headers:{'Cache-Control':'no-store'}});
 }catch(error){return fail(error);}
}
/** Signed vote. The voter is taken from the signature, never from a separate field. */
export async function POST(request:Request){
 try{
  sameOrigin(request);
  const db=database(),origin=new URL(request.url).origin;
  if(!await consumeRequestBudget(db,`fame:ip:${requestClientKey(request)}`,20))return fail(Error('Too many fame votes. Retry later.'),429);
  const body=await limitedJSON(request,4_000);
  assertSignedVoter(body);
  if(!await consumeRequestBudget(db,`fame:voter:${body.payload.voter}`,30,{windowMs:3_600_000}))return fail(Error('Too many fame votes. Retry later.'),429);
  const summary=await applyFame(db,body.payload,body.signature,origin);
  return Response.json({fame:summary},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return fail(error);}
}
