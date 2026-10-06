import {database} from '@/lib/server-owner';
import {registeredProject} from '@/lib/server-project';
import {fail,limitedJSON,sameOrigin,sha256} from '@/lib/server-utils';
import {requestClientKey} from '@/lib/client-key.mjs';
import {consumeRequestBudget} from '@/lib/abuse-budget.mjs';
import {readLaunchPost,updateLaunchPost,verifyLaunchPost} from '@/lib/token-launch-post.mjs';
export const dynamic='force-dynamic';
type Context={params:Promise<{mint:string}>};
export async function GET(_request:Request,{params}:Context){
 try{const project=await registeredProject((await params).mint);return Response.json(await readLaunchPost(database(),project),{headers:{'Cache-Control':'no-store'}});}catch(error){return fail(error,503);}
}
export async function POST(request:Request,{params}:Context){
 try{
  sameOrigin(request);const project=await registeredProject((await params).mint),db=database();
  const ip=await sha256(requestClientKey(request));
  if(!await consumeRequestBudget(db,`launch-post:ip:${ip}`,12))return fail(Error('Launch post updates are temporarily limited. Retry later.'),429);
  const body=await limitedJSON(request,5000),origin=new URL(request.url).origin;
  verifyLaunchPost(body.payload,body.signature,{origin,mint:project.mint,creator:project.creator});
  if(!await consumeRequestBudget(db,`launch-post:mint:${project.mint}`,20,{windowMs:3600000}))return fail(Error('Launch post updates are temporarily limited. Retry later.'),429);
  return Response.json(await updateLaunchPost(db,project,body.payload,body.signature,origin),{headers:{'Cache-Control':'no-store'}});
 }catch(error){return fail(error);}
}
