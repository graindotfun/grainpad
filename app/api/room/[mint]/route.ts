import {database} from '@/lib/server-owner';
import {registeredProject} from '@/lib/server-project';
import {roomPage,publishRoomEvent,verifyRoomPublication} from '@/lib/launch-room.mjs';
import {consumeRequestBudget} from '@/lib/abuse-budget.mjs';
import {requestClientKey} from '@/lib/client-key.mjs';
import {crewAsset,verifyCrewPayment} from '@/lib/crew.mjs';
import {chain} from '@/lib/server-rpc';
import {sharedMarketCache} from '@/lib/server-cache';
import {NETWORKS} from '@/lib/site-config';
import {sameOrigin,limitedJSON,fail} from '@/lib/server-utils';
import {identityCards} from '@/lib/wallet-identity.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{mint:string}>}){try{
 const project=await registeredProject((await params).mint),url=new URL(request.url),db=database();
 const data=await roomPage(db,project.mint,{before:url.searchParams.get('before'),need:url.searchParams.get('need')});
 const wallets=[project.creator];
 for(const event of data.events||[]){const row=event as {author?:string;kind?:string;verification?:string};if(row.author)wallets.push(row.author);if(row.kind==='payment'&&typeof row.verification==='string'){try{const recipient=JSON.parse(row.verification).recipient;if(typeof recipient==='string')wallets.push(recipient);}catch{/* wallet-only fallback */}}}
 for(const task of data.crew||[]){for(const row of task.approved||[])wallets.push(row.contributor);for(const row of task.payments||[])wallets.push(row.contributor);}
 let identities={};try{identities=await identityCards(db,wallets,{limit:80});}catch{identities={};}
 return Response.json({...data,project,identities},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e,400);}}
/** Read-only proof: the finalized transfer from the creator to the approved contributor. Nothing is signed or sent. */
async function paymentProof(db:D1Database,p:{mint:string;target:string;title:string;body:string},creator:string){
 const submission=await db.prepare("SELECT author FROM room_event WHERE id=? AND mint=? AND kind='submission'").bind(p.target,p.mint).first<{author:string}>();
 if(!submission)throw Error('The related contribution was not found. Refresh the room.');
 if(!await consumeRequestBudget(db,'crew:payment:site',120,{windowMs:3600000}))throw Error('Payment checks are busy. Your signed record is kept; retry shortly.');
 if((await sharedMarketCache(db,'mainnet-genesis',()=>chain('mainnet-beta','getGenesisHash'),{ttl:86_400_000,maxStale:86_400_000})).data!==NETWORKS['mainnet-beta'].genesis)throw Error('Network mismatch.');
 const tx=await chain('mainnet-beta','getTransaction',[p.body,{encoding:'jsonParsed',commitment:'finalized',maxSupportedTransactionVersion:0}]);
 return verifyCrewPayment(tx,{payer:creator,recipient:submission.author,asset:crewAsset(p.title,p.mint),signature:p.body});
}
export async function POST(request:Request,{params}:{params:Promise<{mint:string}>}){try{
 sameOrigin(request);const mint=(await params).mint,db=database();
 if(!await consumeRequestBudget(db,`room:ip:${requestClientKey(request)}`,20))return fail(Error('Too many publications. Wait a minute and retry.'),429);
 const {payload,signature}=await limitedJSON(request,12000);
 const p=verifyRoomPublication(payload,signature,new URL(request.url).origin,mint);
 if(!await consumeRequestBudget(db,`room:author:${p.author}`,60,{windowMs:3600000})||!await consumeRequestBudget(db,'room:site',1000,{windowMs:3600000}))return fail(Error('Publication limit reached. Your text is still here; retry later.'),429);
 const project=await registeredProject(mint);
 if(p.kind!=='submission'&&p.author!==project.creator)throw Error('Only the on-chain creator can publish this action.');
 const verification=p.kind==='payment'?await paymentProof(db,p,project.creator):null;
 const event=await publishRoomEvent(db,p,signature,project.creator,Date.now(),{verification});
 return Response.json({event},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e,400);}}
