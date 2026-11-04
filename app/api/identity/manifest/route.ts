import {verifiedCatalogWitnesses,catalogSolTokenMatches} from '@/lib/verified-monero-catalog.mjs';
import {publicCatalogTokenList} from '@/lib/catalog-token-list.mjs';
import {database} from '@/lib/server-owner';
import {bucket,fail} from '@/lib/server-utils';
import {contentHash} from '@/lib/metadata-publication.mjs';
import {IdentityIntegrityError,identityResponseHeaders} from '@/lib/canonical-identity.mjs';
function status(error:unknown){return error instanceof IdentityIntegrityError?409:400;}
export function OPTIONS(){return new Response(null,{status:204,headers:identityResponseHeaders()});}
export async function GET(request:Request){
 try{
  const list=await publicCatalogTokenList(database(),bucket());
  const visible=await verifiedCatalogWitnesses(database(),{network:'mainnet-beta'});
  list.tokens=list.tokens.filter((token:typeof list.tokens[number])=>catalogSolTokenMatches(visible,token));
  const body=JSON.stringify(list);
  const sha256=await contentHash(new TextEncoder().encode(body));
  const headers:Record<string,string>={...identityResponseHeaders(sha256),'Cache-Control':'no-store'};
  if(request.headers.get('if-none-match')===headers.ETag)return new Response(null,{status:304,headers});
  return new Response(body,{headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
 }catch(error){return fail(error,status(error));}
}
