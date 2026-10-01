import {env} from 'cloudflare:workers';
import {database} from '@/lib/server-owner';
import {bucket} from '@/lib/server-utils';
import {archiveXAvatar,clearOauthCookie,completeXAuthorization,consumeOauthState,xOauthConfig,xRedirectUri} from '@/lib/x-oauth.mjs';
import {linkXAccount} from '@/lib/wallet-identity.mjs';
export const dynamic='force-dynamic';
function go(path:string,secure:boolean){
 return new Response(null,{status:302,headers:{Location:path,'Cache-Control':'no-store','Set-Cookie':clearOauthCookie(secure)}});
}
/** X redirects here. Authorization codes are exchanged on the server and discarded. */
export async function GET(request:Request){
 const url=new URL(request.url),secure=url.protocol==='https:';
 const fail=(code:string)=>go(`/fees?identity=${code}`,secure);
 try{
  const runtime=env as unknown as {X_CLIENT_ID?:string;X_CLIENT_SECRET?:string;X_REDIRECT_URI?:string};
  const config=xOauthConfig(runtime);
  if(!config)return fail('x-unavailable');
  const redirectUri=xRedirectUri(url.origin,runtime.X_REDIRECT_URI);
  if(url.searchParams.get('error'))return fail('x-denied');
  const row=await consumeOauthState(database(),url.searchParams.get('state'),request.headers.get('cookie'));
  if(row.redirect_uri!==redirectUri)return fail('x-callback');
  const account=await completeXAuthorization({config,code:url.searchParams.get('code')||'',verifier:row.verifier,redirectUri});
  let avatarHash='';
  try{
   const archived=await archiveXAvatar(account.profileImageUrl);
   if(archived){avatarHash=archived.hash;const storage=bucket();if(!(await storage.head(`assets/${avatarHash}`)))await storage.put(`assets/${avatarHash}`,archived.bytes,{httpMetadata:{contentType:archived.type,cacheControl:'public, max-age=31536000, immutable'}});}
  }catch{avatarHash='';}
  const username=await linkXAccount(database(),row.wallet,account,{replace:row.replace,now:Date.now(),avatarHash});
  return go(`/u/${username}?x=connected`,secure);
 }catch(error){
  const message=error instanceof Error?error.message:'';
  const code=/suspended/i.test(message)?'x-suspended':/already connected/i.test(message)?'x-taken':/Disconnect/i.test(message)?'x-replace':/Claim/i.test(message)?'x-profile':'x-failed';
  return fail(code);
 }
}
