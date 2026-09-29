import {ImageResponse} from 'next/og';
import {Buffer} from 'buffer';
import albertSans from '@/lib/og/albert-sans-500.ttf?inline';
import plexMono from '@/lib/og/ibm-plex-mono-500.woff?inline';
import {shareToken,compact,validMint,type ShareToken} from '@/lib/share-data';
import {crewRecord} from '@/lib/launch-room.mjs';
import {database} from '@/lib/server-owner';
import {bucket} from '@/lib/server-utils';
import {SITE} from '@/lib/site-config';
export const dynamic='force-dynamic';
/** Designed share cards. Data comes from D1 and existing caches only; rendering never reads the chain. */
const C={bg:'#0d1012',panel:'#15191b',ink:'#f1eee7',muted:'#8f989b',line:'#ffffff1f',orange:'#ff6600'};
const font=(uri:string)=>Buffer.from(uri.slice(uri.indexOf(',')+1),'base64');
const fonts=[{name:'Albert',data:font(albertSans),weight:500 as const,style:'normal' as const},{name:'Plex',data:font(plexMono),weight:500 as const,style:'normal' as const}];
const short=(s:string)=>`${s.slice(0,4)}…${s.slice(-4)}`;
async function tokenImage(uri:string){
 try{const url=new URL(uri);if(url.origin!==SITE.origin||!/^\/api\/assets\/[a-f0-9]{64}$/.test(url.pathname))return null;
  const object=await bucket().get('assets/'+url.pathname.split('/').pop());if(!object||object.size>1_500_000)return null;
  const bytes=new Uint8Array(await object.arrayBuffer());
  const type=bytes[0]===0x89&&bytes[1]===0x50?'image/png':bytes[0]===0xff&&bytes[1]===0xd8?'image/jpeg':null;
  return type?`data:${type};base64,${Buffer.from(bytes).toString('base64')}`:null;
 }catch{return null;}
}
function Frame({label,path,children,accent}:{label:string;path:string;children:React.ReactNode;accent?:string}){
 return <div style={{width:1200,height:630,display:'flex',flexDirection:'column',background:C.bg,color:C.ink,fontFamily:'Albert',padding:'56px 64px',position:'relative',overflow:'hidden'}}>
  <div style={{position:'absolute',right:-150,top:-190,width:450,height:450,borderRadius:450,background:'radial-gradient(circle at 35% 35%, #ffb27a 0%, #ff6600 38%, #7a2a00 78%, #2a1206 100%)',opacity:.92,display:'flex'}}/>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%'}}>
   <div style={{display:'flex',fontSize:40,letterSpacing:-1.5}}>grainpad<span style={{color:C.orange}}>.</span></div>
   <div style={{display:'flex',fontFamily:'Plex',fontSize:18,letterSpacing:3,color:C.ink,background:'#0d1012cc',padding:'10px 16px',border:`1px solid ${C.line}`,marginRight:170}}>{label}</div>
  </div>
  <div style={{display:'flex',flexDirection:'column',flex:1,justifyContent:'center'}}>{children}</div>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontFamily:'Plex',fontSize:20,color:C.muted,borderTop:`1px solid ${C.line}`,paddingTop:22}}>
   <span>{path}</span><span style={{color:accent||C.muted}}>Your token page is already here.</span>
  </div>
 </div>;
}
function Identity({t,image,sub}:{t:ShareToken;image:string|null;sub:string}){
 return <div style={{display:'flex',alignItems:'center',gap:36}}>
  {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain img elements. */}
  {image?<img src={image} width={148} height={148} style={{borderRadius:148,border:`2px solid ${C.line}`,objectFit:'cover'}} alt=""/>:<div style={{width:148,height:148,borderRadius:148,background:C.panel,border:`2px solid ${C.line}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:56,color:C.orange}}>{t.record.symbol.slice(0,2).toUpperCase()}</div>}
  <div style={{display:'flex',flexDirection:'column',maxWidth:760}}>
   <div style={{display:'flex',fontSize:96,letterSpacing:-4,lineHeight:1}}>${t.record.symbol.slice(0,12)}</div>
   <div style={{display:'flex',fontSize:34,color:C.muted,marginTop:12}}>{t.record.name.slice(0,40)} · {sub}</div>
  </div>
 </div>;
}
function Stats({items}:{items:[string,string][]}){
 return <div style={{display:'flex',marginTop:48,border:`1px solid ${C.line}`}}>{items.map(([k,v],i)=><div key={k} style={{display:'flex',flexDirection:'column',flex:1,padding:'20px 24px',borderLeft:i?`1px solid ${C.line}`:'none'}}><span style={{fontFamily:'Plex',fontSize:17,letterSpacing:1.5,color:C.muted}}>{k.toUpperCase()}</span><span style={{fontSize:40,marginTop:8,letterSpacing:-1}}>{v}</span></div>)}</div>;
}
function Progress({pct,label}:{pct:number;label:string}){
 return <div style={{display:'flex',flexDirection:'column',marginTop:26}}><div style={{display:'flex',justifyContent:'space-between',fontFamily:'Plex',fontSize:18,color:C.muted}}><span>{label}</span><span style={{color:C.orange}}>{pct>=100?'COMPLETE':`${pct.toFixed(1)}%`}</span></div><div style={{display:'flex',height:8,background:C.panel,marginTop:10,width:'100%'}}><div style={{display:'flex',height:8,width:`${Math.max(2,pct)}%`,background:C.orange}}/></div></div>;
}
async function tokenCard(t:ShareToken,kind:string){
 const image=await tokenImage(t.record.image),graduated=t.route==='cpmm',path=`grainpad.fun/token/${short(t.record.mint)}`;
 const mcap=t.usd?.marketCap!=null?compact(t.usd.marketCap,'$'):t.marketCapQuote!=null?`${compact(t.marketCapQuote)} ${t.quote}`:'—';
 const volume=t.usd?.volume!=null?compact(t.usd.volume,'$'):t.native?.volume?`${compact(Number(t.native.volume.display))} ${t.quote}`:'—';
 if(kind==='receipt')return <Frame label="LAUNCH RECEIPT" path={`${path}/receipt`}><Identity t={t} image={image} sub={`${t.quote} pair`}/><Stats items={[['Launched',new Date(t.record.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})],['Creator',short(t.record.creator)],['Verification','On-chain'],['Lifecycle',graduated?'Graduated':t.route==='graduating'?'Migrating':'Curve']]}/><div style={{display:'flex',marginTop:26,fontSize:26,color:C.muted}}>Provenance, creator declarations and every finalized trade, on one public record.</div></Frame>;
 if(kind==='room')return <Frame label="LAUNCH ROOM · CREW" path={`${path}/room`} accent={C.orange}><Identity t={t} image={image} sub="Crew board"/><Stats items={[['Tasks',String(t.crew.tasks)],['Contributors',String(t.crew.contributors)],['Approved',String(t.crew.approved)],['Paid · verified',String(t.crew.payments)]]}/><div style={{display:'flex',marginTop:26,fontSize:26,color:C.muted}}>Pick a task. Ship the work. Get credited under your wallet.</div></Frame>;
 return <Frame label={graduated?'GRADUATED · RAYDIUM':`TOKEN · ${t.quote} PAIR`} path={path} accent={graduated?C.orange:undefined}>
  <Identity t={t} image={image} sub={graduated?'graduated':`${t.quote} pair`}/>
  <Stats items={[['Market cap',mcap],['24h volume',volume],['24h trades',t.native?.trades?String(t.native.trades):'—'],['Creator',short(t.record.creator)]]}/>
  {t.progressPct!==null&&<Progress pct={t.progressPct} label={graduated?'Bonding curve → Raydium CPMM':`Bonding curve · ${t.raised} / ${t.target} ${t.quote}`}/>}
 </Frame>;
}
async function crewCard(wallet:string){
 const rows=await crewRecord(database(),wallet,{limit:200}),paid=rows.filter(r=>r.payments.length).length,approved=rows.filter(r=>r.approved).length;
 return <Frame label="CREW RECORD" path={`grainpad.fun/creator/${short(wallet)}`} accent={C.orange}>
  <div style={{display:'flex',flexDirection:'column'}}><div style={{display:'flex',fontFamily:'Plex',fontSize:22,color:C.muted,letterSpacing:2}}>WALLET</div><div style={{display:'flex',fontSize:104,letterSpacing:-4,lineHeight:1.05,marginTop:8}}>{short(wallet)}</div></div>
  <Stats items={[['Contributions',String(rows.length)],['Approved',String(approved)],['Paid · verified',String(paid)],['Projects',String(new Set(rows.map(r=>r.mint)).size)]]}/>
  <div style={{display:'flex',marginTop:26,fontSize:26,color:C.muted}}>Work signed by this wallet. Payments checked against finalized transfers.</div>
 </Frame>;
}
export async function GET(request:Request,{params}:{params:Promise<{kind:string;id:string}>}){
 const {kind,id}=await params;
 const cache=(globalThis as unknown as {caches?:{default?:Cache}}).caches?.default,key=new Request(new URL(request.url).toString());
 const hit=await cache?.match(key).catch(()=>undefined);if(hit)return hit;
 try{
  if(!validMint(id)||!['token','receipt','room','crew'].includes(kind))return new Response('Not found',{status:404});
  let element;
  if(kind==='crew')element=await crewCard(id);
  else{const t=await shareToken(id);if(!t)return new Response('Not found',{status:404});element=await tokenCard(t,kind);}
  const image=new ImageResponse(element,{width:1200,height:630,fonts,headers:{'Cache-Control':'public, max-age=600, s-maxage=600'}});
  const bytes=await image.arrayBuffer(),response=new Response(bytes,{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=600, s-maxage=600','X-Content-Type-Options':'nosniff'}});
  await cache?.put(key,response.clone()).catch(()=>undefined);
  return response;
 }catch{return new Response('Share card unavailable',{status:503,headers:{'Cache-Control':'no-store'}});}
}
