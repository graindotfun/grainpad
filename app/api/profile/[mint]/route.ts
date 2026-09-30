import {database} from '@/lib/server-owner';
import {registeredProject} from '@/lib/server-project';
import {bucket,fail,limitedJSON,sameOrigin,sha256} from '@/lib/server-utils';
import {consumeRequestBudget} from '@/lib/abuse-budget.mjs';
import {profileView,publishCreatorProfile,readCreatorProfile,verifyProfileSignature} from '@/lib/creator-profile.mjs';
import {SITE} from '@/lib/site-config';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{mint:string}>}){
 try{
  const project=await registeredProject((await params).mint),db=database();
  const stored=await readCreatorProfile(db,project.mint);
  return Response.json(profileView(project,{...stored.current,revisions:stored.revisions}),{headers:{'Cache-Control':'no-store'}});
 }catch(error){return fail(error,404);}
}
export async function POST(request:Request,{params}:{params:Promise<{mint:string}>}){
 try{
  sameOrigin(request);
  const mint=(await params).mint,db=database(),project=await registeredProject(mint);
  const ip=await sha256(request.headers.get('cf-connecting-ip')||'local');
  if(!await consumeRequestBudget(db,`profile:ip:${ip}`,10)||!await consumeRequestBudget(db,`profile:mint:${project.mint}`,20,{windowMs:3_600_000}))return fail(Error('Profile update limit reached. Retry later.'),429);
  const body=await limitedJSON(request,2_800_000);
  const payload=verifyProfileSignature(body.payload,body.signature,new URL(request.url).origin,project.mint);
  let bytes:Uint8Array|null=null;
  if(payload.bannerHash){
   if(typeof body.bannerBase64!=='string'||body.bannerBase64.length>2_700_000)throw Error('Attach the banner image.');
   bytes=Uint8Array.from(atob(body.bannerBase64),char=>char.charCodeAt(0));
  }
  const stored=await publishCreatorProfile(db,bucket(),payload,body.signature,project.creator,bytes,SITE.origin);
  const history=await readCreatorProfile(db,project.mint);
  return Response.json(profileView(project,{...stored,revisions:history.revisions}),{headers:{'Cache-Control':'no-store'}});
 }catch(error){return fail(error);}
}
