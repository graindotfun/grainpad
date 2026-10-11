import type {ReactNode} from 'react';
import {GRAIN_ORANGE} from '@/lib/brand-colors.mjs';
import {formatPrice,formatUsd} from '@/lib/price-format';
import type {ShareToken} from '@/lib/share-data';
/** Share-card layouts in the D "grains" language: white ground, ink, one orange, Albert Sans 600 and Plex Mono labels.
 * Presentation only. Callers pass already-read data; nothing here reads storage, the network or the chain. A missing
 * figure is drawn as an em dash with its reason, never as a zero or a substitute figure. */
const C={bg:'#ffffff',ink:'#101010',mute:'rgba(16,16,16,.6)',rule:'rgba(16,16,16,.14)',soft:'rgba(16,16,16,.085)',grey:'#3d3d3d',orange:GRAIN_ORANGE};
const NOT_INDEXED='not indexed yet';
export type CardAssets={logo:string};
/** Logo 213×42 at bottom right (padding 60/48) in a field that starts at x=820, plus clear space of half the logo height. */
const LOGO_W=213,LOGO_H=42,LOGO_X=1200-60-LOGO_W-820,LOGO_Y=630-48-LOGO_H,LOGO_CLEAR={x0:LOGO_X-LOGO_H/2,x1:LOGO_X+LOGO_W+LOGO_H/2,y0:LOGO_Y-LOGO_H/2,y1:LOGO_Y+LOGO_H+LOGO_H/2};
const short=(s:string)=>`${s.slice(0,4)}…${s.slice(-4)}`;

/** The decorative grain field: small rotated squares seeded by the mint, so a token's card always draws the same field. */
function seeded(seed:string){let h=2166136261;for(const c of seed)h=Math.imul(h^c.charCodeAt(0),16777619);return ()=>{h=Math.imul(h^h>>>15,2246822507);h=Math.imul(h^h>>>13,3266489909);h^=h>>>16;return (h>>>0)/4294967296;};}
/** keepClear: a rectangle in field coordinates where no grain is drawn (the logo and its clear space). */
export function grainField(seed:string,{width=380,height=630,count=820,keepClear=null as null|{x0:number;x1:number;y0:number;y1:number}}={}){
 const rand=seeded(seed),cx=width*.62,cy=height*.5,r=Math.min(width,height)*.46,rects:string[]=[];
 for(let i=0;i<count;i++){
  // Denser toward the centre, loose toward the edge, like the stage's swarm at rest.
  const a=rand()*Math.PI*2,d=Math.pow(rand(),.62)*r,x=cx+Math.cos(a)*d,y=cy+Math.sin(a)*d*.96,s=3+rand()*4.2,rot=Math.floor(rand()*6)*15;
  // Brand book: the logo keeps clear space of half its height; no grain enters it.
  if(keepClear&&x>keepClear.x0&&x<keepClear.x1&&y>keepClear.y0&&y<keepClear.y1)continue;
  const pick=rand(),fill=pick<.11?C.orange:pick<.78?C.ink:C.grey;
  rects.push(`<rect x="${(x-s/2).toFixed(1)}" y="${(y-s/2).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" fill="${fill}" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"/>`);
 }
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rects.join('')}</svg>`;
 return `data:image/svg+xml;base64,${typeof btoa==='function'?btoa(svg):Buffer.from(svg).toString('base64')}`;
}

const Mono=({children,color=C.ink,size=17,upper=true}:{children:ReactNode;color?:string;size?:number;upper?:boolean})=><div style={{display:'flex',alignItems:'center',fontFamily:'Plex',fontSize:size,letterSpacing:size*.14,color,textTransform:upper?'uppercase':'none'}}>{children}</div>;
/** Brand book: "grainpad" stays lowercase, also inside an uppercase label. */
/** Brand book: "grainpad" and the wXMR ticker keep their case inside uppercase labels. Satori trims edge spaces, so they become no-break spaces. */
function keep(text:string){return text.split(/(grainpad|wXMR)/).filter(Boolean).map((part,i)=><span key={i} style={/^(grainpad|wXMR)$/.test(part)?{textTransform:'none'}:{}}>{part.replace(/^ | $/g,'\u00a0')}</span>);}
function Corner({text}:{text:string}){return <div style={{display:'flex',alignItems:'center'}}>{keep(text)}</div>;}
const Square=({size=11,color=C.orange}:{size?:number;color?:string})=><div style={{display:'flex',width:size,height:size,background:color,borderRadius:2,marginRight:12,flex:'none'}}/>;
/** Card-safe numbers: the fonts have no subscript digits, so subscript-zero notation is drawn as small lowered digits. */
function Figure({text,size,color=C.ink}:{text:string;size:number;color?:string}){
 const parts=text.split(/([₀-₉]+)/).filter(Boolean);
 return <div style={{display:'flex',alignItems:'flex-end',fontSize:size,letterSpacing:-size*.035,lineHeight:1,color}}>{parts.map((part,i)=>/[₀-₉]/.test(part)?<span key={i} style={{fontSize:size*.5,marginBottom:-size*.08,marginRight:1}}>{[...part].map(c=>'₀₁₂₃₄₅₆₇₈₉'.indexOf(c)).join('')}</span>:<span key={i}>{part}</span>)}</div>;
}
export type CardStatus={kind:'new'|'graduating'|'graduated'|'unknown';label:string};
function Chip({status}:{status:CardStatus}){
 const s=status.kind==='new'?{background:C.orange,border:C.orange,color:C.ink}:status.kind==='graduated'?{background:C.ink,border:C.ink,color:C.bg}:status.kind==='graduating'?{background:C.bg,border:C.ink,color:C.ink}:{background:C.bg,border:C.rule,color:C.mute};
 return <div style={{display:'flex',fontFamily:'Plex',fontSize:16,letterSpacing:1.8,textTransform:'uppercase',padding:'9px 18px',borderRadius:999,border:`1.5px solid ${s.border}`,background:s.background,color:s.color}}>{status.label}</div>;
}

/** White record: label row, a seeded grain field on the right, the Grainpad logo bottom right. */
function Frame({seed,corner,status,path,assets,children}:{seed:string;corner:string;status?:CardStatus;path:string;assets:CardAssets;children:ReactNode}){
 return <div style={{width:1200,height:630,display:'flex',flexDirection:'column',background:C.bg,color:C.ink,fontFamily:'Albert',fontWeight:600,padding:'52px 60px 48px',position:'relative',overflow:'hidden'}}>
  {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain img elements. */}
  <img src={grainField(seed,{keepClear:LOGO_CLEAR})} width={380} height={630} style={{position:'absolute',right:0,top:0}} alt=""/>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%'}}><Mono><Square/><Corner text={corner}/></Mono>{status?<Chip status={status}/>:<div style={{display:'flex'}}/>}</div>
  <div style={{display:'flex',flexDirection:'column',flex:1,justifyContent:'center',maxWidth:740}}>{children}</div>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}><Mono size={17} color={C.mute} upper={false}>{path}</Mono>
   {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain img elements. */}
   <img src={assets.logo} width={LOGO_W} height={LOGO_H} alt=""/></div>
 </div>;
}
function Identity({symbol,name,image,byline}:{symbol:string;name:string;image:string|null;byline?:string}){
 return <div style={{display:'flex',alignItems:'center'}}>
  {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain img elements. */}
  {image?<img src={image} width={128} height={128} style={{borderRadius:18,objectFit:'cover',marginRight:32}} alt=""/>:<div style={{width:128,height:128,borderRadius:18,background:C.orange,display:'flex',alignItems:'center',justifyContent:'center',fontSize:54,letterSpacing:-2.5,color:C.ink,marginRight:32}}>{symbol.slice(0,2).toUpperCase()}</div>}
  <div style={{display:'flex',flexDirection:'column',maxWidth:580}}>
   <div style={{display:'flex',fontSize:96,letterSpacing:-4.8,lineHeight:.95}}>${symbol.slice(0,12)}</div>
   <div style={{display:'flex',fontSize:28,letterSpacing:-.5,color:C.mute,marginTop:12}}>{name.slice(0,34)}{byline?` · ${byline}`:''}</div>
  </div>
 </div>;
}
/** Every stat keeps its slot. A missing value is an em dash with the reason underneath. */
export type CardStat={label:string;value:string|null;reason?:string;mono?:boolean};
function Stats({items,note}:{items:CardStat[];note?:string}){
 return <div style={{display:'flex',flexDirection:'column',marginTop:44}}><div style={{display:'flex'}}>{items.map(({label,value,reason,mono},i)=><div key={label} style={{display:'flex',flexDirection:'column',paddingRight:32,marginRight:32,borderRight:i<items.length-1?`1px solid ${C.rule}`:'0'}}>
  <Mono size={15} color={C.mute}>{label}</Mono>
  <div style={{display:'flex',marginTop:12}}>{mono&&value!=null?<div style={{display:'flex',fontFamily:'Plex',fontSize:34,lineHeight:1.2,color:C.ink}}>{value}</div>:<Figure text={value??'—'} size={42} color={value==null?C.mute:C.ink}/>}</div>
  {value==null&&<Mono size={13} color={C.mute}>{reason??NOT_INDEXED}</Mono>}
 </div>)}</div>{note&&<div style={{display:'flex',marginTop:14}}><Mono size={13} color={C.mute}>{note}</Mono></div>}</div>;
}
/** Graduation progress as 24 squares, like the site. Unknown progress draws outlines, never zero. */
function Squares({pct,label,graduated=false}:{pct:number|null;label:string;graduated?:boolean}){
 const filled=pct===null?0:graduated?24:Math.round(Math.max(0,Math.min(100,pct))/100*24);
 return <div style={{display:'flex',flexDirection:'column',marginTop:34,width:600}}>
  <div style={{display:'flex',justifyContent:'space-between'}}><Mono size={15} color={C.mute}>{keep(label)}</Mono><Mono size={15}>{pct===null?'—':graduated||pct>=100?'complete':`${pct.toFixed(1)}%`}</Mono></div>
  <div style={{display:'flex',marginTop:12}}>{Array.from({length:24},(_,i)=><div key={i} style={{display:'flex',width:21,height:12,borderRadius:2,marginRight:i<23?3.9:0,background:pct===null?C.bg:i<filled?C.orange:C.soft,border:pct===null?`1px solid ${C.rule}`:'0'}}/>)}</div>
 </div>;
}
const Line=({children}:{children:ReactNode})=><div style={{display:'flex',marginTop:34,fontSize:27,letterSpacing:-.4,lineHeight:1.25,color:C.mute,maxWidth:700}}>{children}</div>;
function ageText(seconds:number|null){if(seconds===null)return '';if(seconds<3600)return seconds<60?'just launched':`${Math.floor(seconds/60)}m old`;return seconds<86400?`${Math.floor(seconds/3600)}h old`:`${Math.floor(seconds/86400)}d old`;}
/** Same lifecycle words as the site's chips; an older or unknown curve is never called "new". */
export function shareStatus(t:Pick<ShareToken,'route'|'lifecycle'|'progressPct'>):CardStatus{
 if(t.route==='cpmm'||t.lifecycle==='raydium_live')return {kind:'graduated',label:'graduated'};
 if(t.lifecycle==='migration_pending')return {kind:'graduating',label:'migrating'};
 if(t.lifecycle==='curve_complete')return {kind:'graduating',label:'curve complete'};
 if(t.lifecycle==='curve_live')return t.progressPct!==null&&t.progressPct>=80?{kind:'graduating',label:'graduating'}:{kind:'new',label:'on the curve'};
 return {kind:'unknown',label:'not read yet'};
}
export function tokenCard(t:ShareToken,kind:'token'|'receipt'|'room',image:string|null,assets:CardAssets){
 const status=shareStatus(t),graduated=status.kind==='graduated',path=`grainpad.fun/token/${short(t.record.mint)}`,seed=t.record.mint;
 if(kind==='receipt')return <Frame seed={seed} assets={assets} corner="grainpad / launch receipt" status={status} path={`${path}/receipt`}>
  <Identity symbol={t.record.symbol} name={t.record.name} image={image}/>
  <Stats items={[{label:'launched',value:t.record.createdAt.slice(0,10)},{label:'trades',value:t.trades===null?null:String(t.trades)},{label:'creator',value:short(t.record.creator),mono:true}]}/>
  <Line>On-chain facts, creator declarations and observed buys, kept apart on one public record.</Line>
 </Frame>;
 if(kind==='room')return <Frame seed={seed} assets={assets} corner="grainpad / room · crew" status={status} path={`${path}/room`}>
  <Identity symbol={t.record.symbol} name={t.record.name} image={image} byline={`by ${short(t.record.creator)}`}/>
  <Stats items={[{label:'tasks',value:String(t.crew.tasks)},{label:'contributors',value:String(t.crew.contributors)},{label:'paid · verified',value:String(t.crew.payments)}]}/>
  <Line>Pick a task. Ship the work. Get credited under your wallet.</Line>
 </Frame>;
 // Native curve figures lead until graduation; external USD after it, or when no native figure exists. External USD is labelled.
 const nativeFirst=!graduated&&t.marketCapQuote!=null,external=t.usd?.source==='geckoterminal';
 const value=(text:string)=>text==='—'?null:text;
 const mcap=value(nativeFirst||t.usd?.marketCap==null?formatPrice(t.marketCapQuote,t.quote,3):formatUsd(t.usd.marketCap,3));
 const price=value(!graduated&&t.priceQuote!=null||t.usd?.price==null?formatPrice(t.priceQuote,t.quote):formatPrice(t.usd.price,'USD'));
 const stats:CardStat[]=graduated?[{label:'market cap',value:mcap},{label:'24h volume',value:value(formatUsd(t.usd?.volume,3))},{label:'price',value:price}]:[{label:nativeFirst||t.usd?.marketCap==null?'curve mc':'market cap',value:mcap},{label:'price',value:price}];
 // External USD figures carry their source on the card.
 const usdShown=graduated?t.usd?.marketCap!=null||t.usd?.volume!=null||t.usd?.price!=null:!nativeFirst&&t.usd?.marketCap!=null;
 const age=ageText(t.ageSeconds),hasFigures=stats.some(s=>s.value!=null);
 return <Frame seed={seed} assets={assets} corner={`grainpad / ${t.quote} pair${age?` · ${age}`:''}`} status={status} path={path}>
  <Identity symbol={t.record.symbol} name={t.record.name} image={image} byline={`by ${short(t.record.creator)}`}/>
  <Stats items={stats} note={usdShown&&external?'usd figures · geckoterminal':undefined}/>
  {!hasFigures&&<Line>{t.trades===0?'No trades yet. The first trade opens the record.':'Fresh on the curve. Figures appear with the first indexed snapshot.'}</Line>}
  {!graduated&&hasFigures&&<Squares pct={t.progressPct} label={t.progressPct===null?'curve · not read yet':`curve · ${t.raised} / ${t.target} ${t.quote}`}/>}
 </Frame>;
}
export function crewCard(wallet:string,{contributions,approved,paid,projects}:{contributions:number;approved:number;paid:number;projects:number},assets:CardAssets){
 return <Frame seed={wallet} assets={assets} corner="grainpad / crew record" path={`grainpad.fun/creator/${short(wallet)}`}>
  <div style={{display:'flex',flexDirection:'column'}}><Mono size={16} color={C.mute}>wallet</Mono><div style={{display:'flex',fontFamily:'Plex',fontSize:86,letterSpacing:-3,lineHeight:1.05,marginTop:12}}>{short(wallet)}</div></div>
  <Stats items={[{label:'contributions',value:String(contributions)},{label:'approved',value:String(approved)},{label:'paid · verified',value:String(paid)},{label:'projects',value:String(projects)}]}/>
  <Line>Work signed by this wallet. Payments checked against finalized transfers.</Line>
 </Frame>;
}
