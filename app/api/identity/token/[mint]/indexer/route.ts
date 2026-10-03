import {database} from '@/lib/server-owner';
import {bucket,fail} from '@/lib/server-utils';
import {IdentityIntegrityError,identityResponseHeaders,indexerResponseHeaders,indexerView,loadPublicIdentity} from '@/lib/canonical-identity.mjs';
import {AmendmentIntegrityError,currentCanonicalPresentation} from '@/lib/identity-amendment.mjs';
function status(error:unknown){
 if(error instanceof IdentityIntegrityError||error instanceof AmendmentIntegrityError)return 409;
 const message=error instanceof Error?error.message:'';
 if(message==='This token is not a registered Grainpad launch.')return 404;
 return 400;
}
export function OPTIONS(){return new Response(null,{status:204,headers:identityResponseHeaders()});}
export async function GET(request:Request,{params}:{params:Promise<{mint:string}>}){
 try{
  const storage=bucket();
  const identity=await loadPublicIdentity(database(),storage,(await params).mint);
  const presentation=await currentCanonicalPresentation(storage,identity);
  const headers=indexerResponseHeaders(identity.sha256,presentation.amendmentSha256);
  if(request.headers.get('if-none-match')===headers.ETag)return new Response(null,{status:304,headers});
  return Response.json(indexerView(identity,presentation),{headers});
 }catch(error){return fail(error,status(error));}
}
