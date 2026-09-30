import {acquireResourceLease} from '@/lib/resource-leases.mjs';
import {renderPng} from '@/lib/og/render';
import {Buffer} from 'buffer';
import albertSans from '@/lib/og/albert-sans-500.ttf?inline';
import plexMono from '@/lib/og/ibm-plex-mono-500.woff?inline';
import sphere from '@/lib/og/grain-sphere.jpg?inline';
import {formatPrice,formatUsd} from '@/lib/price-format';
import {GRAIN_ORANGE} from '@/lib/brand-colors.mjs';
import {shareToken,validMint,type ShareToken} from '@/lib/share-data';
import {crewRecord} from '@/lib/launch-room.mjs';
import {database} from '@/lib/server-owner';
import {bucket} from '@/lib/server-utils';
import {SITE} from '@/lib/site-config';
export const dynamic='force-dynamic';
/** Designed share cards. Data comes from D1 and existing caches only; rendering never reads the chain. */
const C={paper:'#f3ecdf',ink:'#23211c',muted:'#6d6556',line:'#dccfb6',tape:'#e9dcbf',tapeInk:'#4b4232',orange:GRAIN_ORANGE,track:'#e2d6bf'};
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
/** The card fonts have no subscript digits, so subscript-zero notation is drawn as small lowered digits. */
function Figure({text,size}:{text:string;size:number}){
 const parts=text.split(/([₀-₉]+)/).filter(Boolean);
 return <div style={{display:'flex',alignItems:'flex-end',fontSize:size,letterSpacing:-size*.03,lineHeight:1}}>{parts.map((part,i)=>/[₀-₉]/.test(part)?<span key={i} style={{fontSize:size*.5,marginBottom:-size*.08,marginRight:1}}>{[...part].map(c=>'₀₁₂₃₄₅₆₇₈₉'.indexOf(c)).join('')}</span>:<span key={i}>{part}</span>)}</div>;
}
const Mono=({children,color=C.muted,size=17,upper=true}:{children:React.ReactNode;color?:string;size?:number;upper?:boolean})=><div style={{display:'flex',fontFamily:'Plex',fontSize:size,letterSpacing:upper?2:0.5,color,textTransform:upper?'uppercase':'none'}}>{children}</div>;
/** Cream record: corner labels, the granular sphere, one wordmark. Masking tape only marks a lifecycle state. */
function Frame({corner,state,path,children}:{corner:string;state?:string;path:string;children:React.ReactNode}){
 return <div style={{width:1200,height:630,display:'flex',flexDirection:'column',background:C.paper,color:C.ink,fontFamily:'Albert',padding:'44px 56px 40px',position:'relative',overflow:'hidden'}}>
  <div style={{position:'absolute',left:24,top:24,right:24,bottom:24,border:`1px solid ${C.line}`,display:'flex'}}/>
  {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain img elements. */}
  <img src={sphere} width={430} height={430} style={{position:'absolute',right:-70,top:96}} alt=""/>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%'}}><Mono>{`Grainpad / ${corner}`}</Mono>{state?<div style={{display:'flex',background:C.tape,color:C.tapeInk,fontFamily:'Plex',fontSize:17,letterSpacing:2,padding:'7px 16px',transform:'rotate(-2deg)',textTransform:'uppercase'}}>{state}</div>:<div style={{display:'flex'}}/>}</div>
  <div style={{display:'flex',flexDirection:'column',flex:1,justifyContent:'center',maxWidth:800}}>{children}</div>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}><Mono size={18} upper={false}>{path}</Mono><div style={{display:'flex',fontSize:40,letterSpacing:-1.5,lineHeight:1}}>grainpad<span style={{color:C.orange}}>.</span></div></div>
 </div>;
}
function Identity({t,image,creator=true}:{t:ShareToken;image:string|null;creator?:boolean}){
 return <div style={{display:'flex',alignItems:'center',gap:30}}>
  {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain img elements. */}
  {image?<img src={image} width={120} height={120} style={{borderRadius:24,border:`2px solid ${C.line}`,objectFit:'cover'}} alt=""/>:<div style={{width:120,height:120,borderRadius:24,background:C.ink,display:'flex',alignItems:'center',justifyContent:'center',fontSize:46,color:C.paper}}>{t.record.symbol.slice(0,2).toUpperCase()}</div>}
  <div style={{display:'flex',flexDirection:'column',maxWidth:600}}>
   <div style={{display:'flex',fontSize:92,letterSpacing:-4,lineHeight:1}}>${t.record.symbol.slice(0,12)}</div>
   <div style={{display:'flex',fontSize:28,color:C.muted,marginTop:10}}>{t.record.name.slice(0,34)}{creator?` · by ${short(t.record.creator)}`:''}</div>
  </div>
 </div>;
}
/** Only real values are drawn. A missing figure is left out rather than printed as a dash. */
function Stats({items}:{items:[string,string][]}){
 const shown=items.filter(([,v])=>v&&v!=='—');if(!shown.length)return null;
 return <div style={{display:'flex',marginTop:44,gap:48}}>{shown.map(([k,v])=><div key={k} style={{display:'flex',flexDirection:'column'}}><Mono size={16}>{k}</Mono><div style={{display:'flex',marginTop:10}}><Figure text={v} size={44}/></div></div>)}</div>;
}
function Progress({pct,label}:{pct:number;label:string}){
 return <div style={{display:'flex',flexDirection:'column',marginTop:30,width:640}}><div style={{display:'flex',justifyContent:'space-between'}}><Mono size={16}>{label}</Mono><Mono size={16} color={C.ink}>{pct>=100?'complete':`${pct.toFixed(1)}%`}</Mono></div><div style={{display:'flex',height:8,background:C.track,marginTop:10,width:'100%',borderRadius:8}}><div style={{display:'flex',height:8,width:`${Math.max(2,pct)}%`,background:C.orange,borderRadius:8}}/></div></div>;
}
const Line=({children}:{children:React.ReactNode})=><div style={{display:'flex',marginTop:36,fontSize:28,color:C.muted,maxWidth:700}}>{children}</div>;
function ageText(seconds:number|null){if(seconds===null)return '';if(seconds<3600)return seconds<60?'just launched':`${Math.floor(seconds/60)}m old`;return seconds<86400?`${Math.floor(seconds/3600)}h old`:`${Math.floor(seconds/86400)}d old`;}
async function tokenCard(t:ShareToken,kind:string){
 const image=await tokenImage(t.record.image),graduated=t.route==='cpmm'||t.lifecycle==='raydium_live',path=`grainpad.fun/token/${short(t.record.mint)}`;
 // Lifecycle and age come from #39's share data; masking tape marks the lifecycle state only.
 const state=graduated?'Graduated':t.lifecycle==='migration_pending'?'Migrating':t.lifecycle==='curve_complete'?'Curve complete':t.lifecycle==='curve_live'?'On the curve':undefined;
 const age=ageText(t.ageSeconds);
 // Native curve figures lead until graduation; external USD is used after it, or when no native figure exists.
 const nativeFirst=!graduated&&t.marketCapQuote!=null;
 const mcap=nativeFirst||t.usd?.marketCap==null?formatPrice(t.marketCapQuote,t.quote,3):formatUsd(t.usd.marketCap,3);
 const price=!graduated&&t.priceQuote!=null||t.usd?.price==null?formatPrice(t.priceQuote,t.quote):formatPrice(t.usd.price,'USD');
 if(kind==='receipt')return <Frame corner="Launch receipt" state={state} path={`${path}/receipt`}><Identity t={t} image={image} creator={false}/><Stats items={[['Launched',t.record.createdAt.slice(0,10)],['Trades',t.trades===null?'—':String(t.trades)],['Creator',short(t.record.creator)]]}/><Line>On-chain facts, creator declarations and observed buys, kept apart on one public record.</Line></Frame>;
 if(kind==='room')return <Frame corner="Room · crew" state={state} path={`${path}/room`}><Identity t={t} image={image}/><Stats items={[['Tasks',String(t.crew.tasks)],['Contributors',String(t.crew.contributors)],['Paid · verified',String(t.crew.payments)]]}/><Line>Pick a task. Ship the work. Get credited under your wallet.</Line></Frame>;
 // USD from #39's share data carries its source; an external figure is labeled as such on the card.
 const ext=t.usd?.source==='geckoterminal'?' · GeckoTerminal':'';
 const stats:[string,string][]=graduated?[[`Market cap${t.usd?.marketCap!=null?ext:''}`,mcap],[`24h volume${ext}`,formatUsd(t.usd?.volume,3)],[`Price${t.usd?.price!=null?ext:''}`,price]]:[[nativeFirst||t.usd?.marketCap==null?'Curve MC':`Market cap${ext}`,mcap],['Price',price]];
 const hasFigures=stats.some(([,v])=>v!=='—');
 return <Frame corner={`Token · ${t.quote} pair${age?` · ${age}`:''}`} state={state} path={path}>
  <Identity t={t} image={image}/>
  <Stats items={stats}/>
  {!hasFigures&&<Line>{t.trades===0?'No trades yet. The first trade opens the record.':'Fresh on the curve. Figures appear with the first indexed snapshot.'}</Line>}
  {t.progressPct!==null&&!graduated&&<Progress pct={t.progressPct} label={`Curve · ${t.raised} / ${t.target} ${t.quote}`}/>}
 </Frame>;
}
async function crewCard(wallet:string){
 const rows=await crewRecord(database(),wallet,{limit:200}),paid=rows.filter(r=>r.payments.length).length,approved=rows.filter(r=>r.approved).length;
 return <Frame corner="Crew record" path={`grainpad.fun/creator/${short(wallet)}`}>
  <div style={{display:'flex',flexDirection:'column'}}><Mono size={20}>Wallet</Mono><div style={{display:'flex',fontFamily:'Plex',fontSize:88,letterSpacing:-3,lineHeight:1.05,marginTop:10}}>{short(wallet)}</div></div>
  <Stats items={[['Contributions',String(rows.length)],['Approved',String(approved)],['Paid · verified',String(paid)],['Projects',String(new Set(rows.map(r=>r.mint)).size)]]}/>
  <Line>Work signed by this wallet. Payments checked against finalized transfers.</Line>
 </Frame>;
}
export async function GET(request:Request,{params}:{params:Promise<{kind:string;id:string}>}){
 const {kind,id}=await params;
 if(!validMint(id)||!['token','receipt','room','crew'].includes(kind))return new Response('Not found',{status:404});
 const cache=(globalThis as unknown as {caches?:{default?:Cache}}).caches?.default,key=new Request(`${SITE.origin}/api/og/${kind}/${id}`);
 const hit=await cache?.match(key).catch(()=>undefined);if(hit)return hit;
 let release:(()=>Promise<void>)|null=null;
 try{
  release=await acquireResourceLease(database(),'og-render',{slots:2,ttlMs:60_000});
  if(!release)return new Response('Share card busy',{status:429,headers:{'Retry-After':'10','Cache-Control':'no-store'}});
  // Fixed ten cold attempts per rolling minute, including nonexistent IDs.
  // Do not release these quota tokens early; cached hits bypass this path.
  if(!await acquireResourceLease(database(),'og-cold',{slots:10,ttlMs:60_000}))return new Response('Share card busy',{status:429,headers:{'Retry-After':'60','Cache-Control':'no-store'}});
  let element;
  if(kind==='crew')element=await crewCard(id);
  else{const t=await shareToken(id);if(!t)return new Response('Not found',{status:404});element=await tokenCard(t,kind);}
  const bytes=await renderPng(element,{width:1200,height:630,fonts}),response=new Response(bytes as Uint8Array<ArrayBuffer>,{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=600, s-maxage=600','X-Content-Type-Options':'nosniff'}});
  await cache?.put(key,response.clone()).catch(()=>undefined);
  return response;
 }catch(error){console.error('grainpad_og',JSON.stringify({kind,message:error instanceof Error?error.message.slice(0,300):'render failed'}));return new Response('Share card unavailable',{status:503,headers:{'Cache-Control':'no-store'}});}finally{await release?.();}
}
