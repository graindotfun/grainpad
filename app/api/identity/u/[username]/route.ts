import {database} from '@/lib/server-owner';
import {fail} from '@/lib/server-utils';
import {consumeRequestBudget} from '@/lib/abuse-budget.mjs';
import {requestClientKey} from '@/lib/client-key.mjs';
import {grainpadPlatformId} from '@/lib/platform-policy';
import {readPublicIdentity} from '@/lib/wallet-identity.mjs';
import {fameSummary} from '@/lib/wallet-fame.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{username:string}>}){
 try{
  const db=database();
  if(!await consumeRequestBudget(db,`identity:read:${requestClientKey(request)}`,60))return fail(Error('Too many profile requests.'),429);
  const view=await readPublicIdentity(db,(await params).username,{platform:grainpadPlatformId().toBase58()});
  if(!view)return fail(Error('Profile not found.'),404);
  const fame='profile' in view&&view.profile?await fameSummary(db,view.profile.wallet).catch(()=>null):null;
  return Response.json(fame?{...view,fame}:view,{headers:{'Cache-Control':'no-store'}});
 }catch(error){return fail(error,404);}
}
