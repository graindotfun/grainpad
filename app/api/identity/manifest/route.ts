import {database} from '@/lib/server-owner';
import {bucket,fail} from '@/lib/server-utils';
import {contentHash} from '@/lib/metadata-publication.mjs';
import {IdentityIntegrityError,identityResponseHeaders,publicTokenList} from '@/lib/canonical-identity.mjs';
function status(error:unknown){return error instanceof IdentityIntegrityError?409:400;}
export function OPTIONS(){return new Response(null,{status:204,headers:identityResponseHeaders()});}
export async function GET(request:Request){
 try{
  const list=await publicTokenList(database(),bucket());
  const body=JSON.stringify(list);
  const sha256=await contentHash(new TextEncoder().encode(body));
  const headers=identityResponseHeaders(sha256);
  if(request.headers.get('if-none-match')===headers.ETag)return new Response(null,{status:304,headers});
  return new Response(body,{headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
 }catch(error){return fail(error,status(error));}
}
