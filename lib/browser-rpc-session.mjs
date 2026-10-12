let expires=0,pending=null;
const genesis=new Map();
export async function sessionRpcFetch(input,init,retried=false){
 if(Date.now()>=expires){
  if(!pending)pending=fetch('/api/rpc-session',{method:'POST',credentials:'same-origin'}).then(async r=>{if(!r.ok)throw Error('Trading connection is unavailable. Please retry shortly.');expires=Date.now()+480_000;}).finally(()=>{pending=null;});
  await pending;
 }
 const body=typeof init?.body==='string'?JSON.parse(init.body):null;
 const url=String(input),cached=genesis.get(url);
 if(body?.method==='getGenesisHash'&&cached&&cached.expires>Date.now())return Response.json({...cached.value,id:body.id});
 const response=await fetch(input,{...init,credentials:'same-origin'});
 // 403 is emitted before any upstream request. Renew once; identical signed bytes are retained.
 if(response.status===403&&!retried){expires=0;await response.body?.cancel();return sessionRpcFetch(input,init,true);}
 if(body?.method==='getGenesisHash'&&response.ok){const value=await response.clone().json();if(typeof value.result==='string'&&!value.error)genesis.set(url,{value,expires:Date.now()+60_000});}
 return response;
}
