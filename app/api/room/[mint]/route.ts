import {database} from '@/lib/server-owner';
import {registeredProject} from '@/lib/server-project';
import {roomPage,publishRoomEvent,verifyRoomPublication} from '@/lib/launch-room.mjs';
import {consumeRequestBudget} from '@/lib/abuse-budget.mjs';
import {sameOrigin,limitedJSON,fail} from '@/lib/server-utils';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{mint:string}>}){try{
 const project=await registeredProject((await params).mint),url=new URL(request.url);
 const data=await roomPage(database(),project.mint,{before:url.searchParams.get('before'),need:url.searchParams.get('need')});
 return Response.json({...data,project},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e,400);}}
export async function POST(request:Request,{params}:{params:Promise<{mint:string}>}){try{
 sameOrigin(request);const mint=(await params).mint,db=database();
 if(!await consumeRequestBudget(db,`room:ip:${request.headers.get('cf-connecting-ip')||'local'}`,20))return fail(Error('Too many publications. Wait a minute and retry.'),429);
 const {payload,signature}=await limitedJSON(request,12000);
 const p=verifyRoomPublication(payload,signature,new URL(request.url).origin,mint);
 if(!await consumeRequestBudget(db,`room:author:${p.author}`,60,{windowMs:3600000})||!await consumeRequestBudget(db,'room:site',1000,{windowMs:3600000}))return fail(Error('Publication limit reached. Your text is still here; retry later.'),429);
 const project=await registeredProject(mint);
 const event=await publishRoomEvent(db,p,signature,project.creator);
 return Response.json({event},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e,400);}}
