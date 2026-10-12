import {env} from 'cloudflare:workers';import {verifyRpcSession} from './rpc-session.mjs';
export async function requireRpcSession(request:Request){
 const token=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('grainpad-rpc='))?.slice('grainpad-rpc='.length);
 await verifyRpcSession((env as unknown as {RPC_SESSION_SECRET?:string}).RPC_SESSION_SECRET,request.headers.get('cf-connecting-ip')||'local',token);
}
