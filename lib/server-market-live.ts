import {serverMarket} from './server-market';
import {database} from './server-owner';
import {chain} from './server-rpc';
import {grainpadPlatformId,POLICY} from './platform-policy';
import {parseChainEvents} from './chain-events.mjs';
import {quotePerToken} from './native-market.mjs';
import {sharedMarketCache,takeBudget} from './shared-market-cache.mjs';
import {confirmedCatchup} from './realtime-ingest.mjs';

type LiveEnv={SOLANA_RPC_URL?:string};
/** Fixed, verified pool subscription. Client messages cannot select RPC methods or addresses. */
export async function marketLive(request:Request,runtime:LiveEnv):Promise<Response>{
 const url=new URL(request.url),match=/^\/api\/market\/([1-9A-HJ-NP-Za-km-z]{32,44})\/live$/.exec(url.pathname);
 if(!match)return new Response('Not found',{status:404});
 if(request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
 if(request.headers.get('Origin')!==url.origin)return new Response('Same-origin connection required',{status:403});
 try{
  const mint=match[1],db=database(),market=await serverMarket(mint,{viewer:true});
  const saved=await db.prepare('SELECT record FROM launch_index WHERE network=? AND platform_id=? AND mint=?').bind('mainnet-beta',grainpadPlatformId().toBase58(),mint).first<{record:string}>();
  if(!saved)return new Response('Registered launch required',{status:404});
  const record={...JSON.parse(saved.record),pool:market.pool};
  if(!await takeBudget(db,'market-live-connect-minute',1,60,60000))return new Response('Live connections are busy',{status:429});
  const endpoint=new URL(runtime.SOLANA_RPC_URL||'https://solana-rpc.publicnode.com');
  if(endpoint.protocol!=='https:')throw Error('Invalid RPC configuration');endpoint.protocol='wss:';
  const upstream=new WebSocket(endpoint.href),[client,server]=Object.values(new WebSocketPair());server.accept();
  let stopped=false,subscribed=false,running=false;
  const queue:string[]=[],seen=new Set<string>();
  const send=(value:unknown)=>{if(!stopped&&server.readyState===WebSocket.OPEN)server.send(JSON.stringify(value));};
  const close=()=>{if(stopped)return;stopped=true;clearInterval(heartbeat);clearTimeout(lifetime);clearTimeout(handshake);try{upstream.close(1000,'Viewer closed');}catch{}try{server.close(1012,'Reconnect to the live market');}catch{}};
  const heartbeat=setInterval(()=>send({type:'heartbeat',time:Date.now()}),15000),lifetime=setTimeout(close,300000),handshake=setTimeout(()=>{if(!subscribed)close();},10000);
  const emit=(events:ReturnType<typeof parseChainEvents>)=>{
   for(const event of events){
    if(event.mint!==mint||!['buy','sell'].includes(event.kind)||!Number.isSafeInteger(event.blockTime))continue;
    const value=quotePerToken(event.baseAmount,event.quoteAmount,event.baseDecimals,event.quoteDecimals);if(value===null)continue;
    send({type:'trade',pool:market.pool,mint,id:event.id,signature:event.signature,slot:event.slot,time:event.blockTime,value,receivedAt:Date.now(),commitment:'confirmed'});
   }
  };
  const drain=async()=>{
   if(running)return;running=true;
   try{while(queue.length&&!stopped){
    const signature=queue.shift()!;
    try{const result=await sharedMarketCache(db,`live-trade:v1:${mint}:${signature}`,async()=>{
     const tx=await chain('mainnet-beta','getTransaction',[signature,{encoding:'json',commitment:'confirmed',maxSupportedTransactionVersion:1}]);
     if(!tx)throw Error('Confirmed transaction not available yet');
     return parseChainEvents(tx,signature,[record],POLICY.cpConfig,record.platformId).filter(event=>event.mint===mint&&['buy','sell'].includes(event.kind));
    },{ttl:300000,maxStale:300000});emit(result.data);}catch{send({type:'gap',notice:'A trade could not be read. Reconnecting and refreshing history.'});close();}
   }}finally{running=false;}
  };
  upstream.addEventListener('open',()=>upstream.send(JSON.stringify({jsonrpc:'2.0',id:1,method:'logsSubscribe',params:[{mentions:[market.pool]},{commitment:'confirmed'}]})));
  upstream.addEventListener('message',event=>{
   if(stopped||typeof event.data!=='string'||event.data.length>262144)return;
   try{const body=JSON.parse(event.data);
    if(body.id===1){if(body.error||!Number.isSafeInteger(body.result)){close();return;}subscribed=true;clearTimeout(handshake);send({type:'ready',mint,pool:market.pool,time:Date.now(),commitment:'confirmed'});
     void confirmedCatchup((method:string,params:unknown[])=>chain('mainnet-beta',method,params),record,new Set(),POLICY.cpConfig,{signatures:10,transactions:5}).then(emit).catch(()=>{});return;}
    if(body.method!=='logsNotification'||body.params?.result?.value?.err)return;
    const signature=body.params?.result?.value?.signature;if(typeof signature!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)||seen.has(signature))return;
    seen.add(signature);if(seen.size>1024)seen.delete(seen.values().next().value!);
    if(queue.length>=64){send({type:'gap',notice:'Live activity exceeded the reader. Refreshing history.'});close();return;}
    queue.push(signature);void drain();
   }catch{/* Ignore non-JSON provider frames. Never relay raw RPC content or URLs. */}
  });
  upstream.addEventListener('error',close);upstream.addEventListener('close',close);server.addEventListener('close',close);server.addEventListener('error',close);
  // The browser has no upstream RPC access; unexpected client payloads end the session.
  server.addEventListener('message',close);
  return new Response(null,{status:101,webSocket:client});
 }catch{return new Response('Live market is temporarily unavailable',{status:503});}
}
