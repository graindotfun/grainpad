import {database} from '@/lib/server-owner';
import {bucket,fail,limitedJSON,sameOrigin} from '@/lib/server-utils';
import {consumeRequestBudget} from '@/lib/abuse-budget.mjs';
import {requestClientKey} from '@/lib/client-key.mjs';
import {applyIdentity,assertSignedWallet} from '@/lib/wallet-identity.mjs';
export const dynamic='force-dynamic';
function avatar(value:unknown){
 if(value==null||value==='')return null;
 if(typeof value!=='string'||value.length>2_800_000)throw Error('Attach the avatar image.');
 const bytes=Uint8Array.from(atob(value),char=>char.charCodeAt(0));
 if(bytes.length>2_000_000)throw Error('Upload a complete image below 2 MB.');
 return bytes;
}
/** Signed profile mutation. The wallet is taken from the signature, never from a separate field. */
export async function POST(request:Request){
 try{
  sameOrigin(request);
  const db=database(),origin=new URL(request.url).origin,ip=requestClientKey(request);
  if(!await consumeRequestBudget(db,`identity:ip:${ip}`,20))return fail(Error('Too many identity updates. Retry later.'),429);
  const body=await limitedJSON(request,2_800_000);
  assertSignedWallet(body);
  if(!await consumeRequestBudget(db,`identity:wallet:${body.payload.wallet}`,10,{windowMs:3_600_000}))return fail(Error('Too many identity updates. Retry later.'),429);
  const bytes=avatar(body.avatarBase64);
  const profile=await applyIdentity(db,bytes?bucket():null,body.payload,body.signature,bytes,origin);
  return Response.json({profile},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return fail(error);}
}
