import {env} from 'cloudflare:workers';
import {database} from '@/lib/server-owner';
import {fail,limitedJSON,sameOrigin} from '@/lib/server-utils';
import {consumeRequestBudget} from '@/lib/abuse-budget.mjs';
import {requestClientKey} from '@/lib/client-key.mjs';
import {assertSignedWallet,verifyConnectXSignature} from '@/lib/wallet-identity.mjs';
import {authorizationUrl,createPkce,oauthCookie,xOauthConfig,xRedirectUri} from '@/lib/x-oauth.mjs';
export const dynamic='force-dynamic';
/** Starts X OAuth for a wallet that just signed. The verifier never leaves the server. */
export async function POST(request:Request){
 try{
  sameOrigin(request);
  const runtime=env as unknown as {X_CLIENT_ID?:string;X_CLIENT_SECRET?:string;X_REDIRECT_URI?:string};
  const config=xOauthConfig(runtime);
  if(!config)return fail(Error('X connection is not configured.'),503);
  const origin=new URL(request.url).origin,redirectUri=xRedirectUri(origin,runtime.X_REDIRECT_URI),db=database();
  if(!await consumeRequestBudget(db,`identity:x-ip:${requestClientKey(request)}`,10))return fail(Error('Too many X connection attempts.'),429);
  const body=await limitedJSON(request,4000);
  assertSignedWallet(body);
  const payload=verifyConnectXSignature(body.payload,body.signature,origin);
  if(!await consumeRequestBudget(db,`identity:x:${payload.wallet}`,5,{windowMs:3_600_000}))return fail(Error('Too many X connection attempts.'),429);
  const profile=await db.prepare('SELECT username FROM wallet_identity WHERE wallet=?').bind(payload.wallet).first<{username:string}>();
  if(!profile)return fail(Error('Claim a Grainpad username before connecting X.'),400);
  const pkce=await createPkce(),expires=Date.now()+600_000;
  await db.prepare('DELETE FROM wallet_identity_oauth WHERE expires_at<? OR wallet=?').bind(Date.now(),payload.wallet).run();
  await db.prepare('INSERT INTO wallet_identity_oauth(state,wallet,verifier,redirect_uri,replace,expires_at) VALUES(?,?,?,?,?,?)').bind(pkce.state,payload.wallet,pkce.verifier,redirectUri,payload.replace,expires).run();
  const url=authorizationUrl({clientId:config.clientId,redirectUri,state:pkce.state,challenge:pkce.challenge});
  return new Response(JSON.stringify({url}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':oauthCookie(pkce.state,origin.startsWith('https://'))}});
 }catch(error){return fail(error instanceof Error&&/not configured|not usable|not allowed/.test(error.message)?Error('X connection is not configured.'):error,error instanceof Error&&/not configured|not usable|not allowed/.test(error.message)?503:400);}
}
