import {database} from '@/lib/server-owner';
import {bucket,fail,limitedJSON,sameOrigin,sha256} from '@/lib/server-utils';
import {consumeRequestBudget} from '@/lib/abuse-budget.mjs';
import {IdentityIntegrityError,identityResponseHeaders,loadPublicIdentity,registeredLaunch} from '@/lib/canonical-identity.mjs';
import {AmendmentIntegrityError,appendIdentityAmendment,currentCanonicalPresentation,readAmendmentLog} from '@/lib/identity-amendment.mjs';
function status(error:unknown){
 if(error instanceof IdentityIntegrityError||error instanceof AmendmentIntegrityError)return 409;
 const message=error instanceof Error?error.message:'';
 if(message==='This token is not a registered Grainpad launch.')return 404;
 return 400;
}
export function OPTIONS(){return new Response(null,{status:204,headers:identityResponseHeaders()});}
export async function GET(_request:Request,{params}:{params:Promise<{mint:string}>}){
 try{
  const storage=bucket();
  const identity=await loadPublicIdentity(database(),storage,(await params).mint);
  const log=await readAmendmentLog(storage,identity.document.mint);
  const presentation=await currentCanonicalPresentation(storage,identity);
  const headers=identityResponseHeaders();
  headers['Cache-Control']='public, max-age=60';
  return Response.json({schema:log.schema,mint:identity.document.mint,identitySha256:identity.sha256,document:identity.document,revisions:log.revisions,presentation},{headers});
 }catch(error){return fail(error,status(error));}
}
export async function POST(request:Request,{params}:{params:Promise<{mint:string}>}){
 try{
  sameOrigin(request);
  const mint=(await params).mint;
  const db=database();
  const launch=await registeredLaunch(db,mint);
  const ip=await sha256(request.headers.get('cf-connecting-ip')||'local');
  if(!await consumeRequestBudget(db,`identity-amendment:ip:${ip}`,10)||!await consumeRequestBudget(db,`identity-amendment:mint:${launch.mint}`,20,{windowMs:3_600_000}))return fail(Error('Identity update limit reached. Retry later.'),429);
  const body=await limitedJSON(request,2_800_000);
  let bytes:Uint8Array|undefined;
  if(body.payload?.headerSha256){
   if(typeof body.headerBase64!=='string'||body.headerBase64.startsWith('http://')||body.headerBase64.startsWith('https://'))throw Error('An arbitrary URL cannot replace the header asset.');
   bytes=Uint8Array.from(atob(body.headerBase64),char=>char.charCodeAt(0));
  }
  const storage=bucket();
  await appendIdentityAmendment(storage,launch,body.payload,body.signature,bytes,body.headerType);
  const identity=await loadPublicIdentity(db,storage,launch.mint);
  const log=await readAmendmentLog(storage,launch.mint);
  const presentation=await currentCanonicalPresentation(storage,identity);
  return Response.json({schema:log.schema,mint:launch.mint,identitySha256:identity.sha256,document:identity.document,revisions:log.revisions,presentation},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return fail(error,status(error));}
}
