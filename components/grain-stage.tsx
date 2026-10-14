'use client';
import {useEffect,useRef} from 'react';
import {GRAIN_ORANGE} from '@/lib/brand-colors.mjs';
import {BRAND_ASSETS} from '@/lib/brand-assets';
import {GRAIN_LEVELS,STATIC_LEVEL,grainCount,grainScale,nextGrainLevel,windowFrames} from '@/lib/grain-stage-policy.mjs';

/** The grain stage: an illustration only. It never reads a wallet, a market or a transaction.
 * 0 idea: a free swarm. 1 identity: the word with an orange period. 2 on-chain: the Grainpad symbol, or a stone token. */
export type GrainMode=0|1|2;
export type GrainPalette='theme'|'light';

const INK_LIGHT='#101010',GREY_LIGHT='#3d3d3d',INK_DARK='#ffffff',GREY_DARK='#555555';
const FONT='"Albert Sans Variable","Albert Sans",sans-serif';
const DEFAULT_WORD='grainpad';
const ROTATIONS=6,LEVEL_KEY='grainpad:grain-stage-level';
/** rAF delivers frames on vsync, so the gate sits a little under the frame period. */
const frameGate=(fps:number)=>fps?1000/fps-2:Infinity;
function savedLevel(){try{const v=Number(sessionStorage.getItem(LEVEL_KEY));return Number.isInteger(v)&&v>0?Math.min(STATIC_LEVEL,v):0;}catch{return 0;}}

/** Composer input to stage word: a-z, 0-9 and space, at most 12 characters, empty means grainpad. */
export function grainWord(value:string|null|undefined){
 const word=(value||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim().slice(0,12).trim();
 return word||DEFAULT_WORD;
}

function mulberry(seed:number){let a=seed;return ()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}

type Point={x:number;y:number;c:number};
type Draw=(x:CanvasRenderingContext2D,w:number,h:number)=>void;
type Classify=((r:number,g:number,b:number)=>number)|null;

let symbolImage:HTMLImageElement|null=null,symbolReady:Promise<HTMLImageElement|null>|null=null;
function loadSymbol(){
 if(symbolReady)return symbolReady;
 symbolReady=new Promise(resolve=>{const image=new Image();image.decoding='async';image.onload=()=>{symbolImage=image;resolve(image);};image.onerror=()=>resolve(null);image.src=BRAND_ASSETS.logoSymbol;});
 return symbolReady;
}

class Stage{
 private ctx:CanvasRenderingContext2D;
 private N:number;private requestedCount?:number;private nS=0;private floorFrac:number;
 private word=DEFAULT_WORD;mode:GrainMode=0;private free=true;
 private palette:GrainPalette;
 // Particle state lives in typed arrays so the frame loop allocates nothing.
 private x!:Float32Array;private y!:Float32Array;private vx!:Float32Array;private vy!:Float32Array;private tx!:Float32Array;private ty!:Float32Array;
 private s!:Float32Array;private a!:Float32Array;private ph!:Float32Array;private dir!:Float32Array;private sp!:Float32Array;private sw!:Float64Array;
 private c!:Uint8Array;private nc!:Uint8Array;private fl!:Uint8Array;
 private F:Point[]=[];private T:Point[][]=[[],[],[]];
 private mx=-1e4;private my=-1e4;private pulse=0;
 private W=0;private H=0;private dpr=1;private ready=false;private k=1;
 private reduce:boolean;private visible=false;private raf=0;private last=0;
 private fontsReady=false;private disposed=false;
 // Adaptive quality (lib/grain-stage-policy.mjs): a random rank per grain decides which grains stay when the count drops.
 private level=0;private active=0;private gate=frameGate(30);private rank:Uint32Array|null=null;
 private wFrames=0;private wInterval=0;private wWork=0;private wSkip=1;
 private cleanup:(()=>void)[]=[];

 constructor(private cv:HTMLCanvasElement,o:{count?:number;floor:number;palette:GrainPalette;word:string;mode:GrainMode}){
  this.ctx=cv.getContext('2d')!;this.requestedCount=o.count;this.N=o.count??grainCount(0,0);this.floorFrac=o.floor;this.palette=o.palette;this.word=o.word;this.mode=o.mode;
  this.setLevel(savedLevel());
  const media=matchMedia('(prefers-reduced-motion: reduce)');this.reduce=media.matches;
  const onMedia=()=>{this.reduce=media.matches;this.mx=-1e4;if(this.frozen)this.snap();this.schedule();};
  media.addEventListener('change',onMedia);this.cleanup.push(()=>media.removeEventListener('change',onMedia));
  const parent=cv.parentElement!;
  const move=(e:PointerEvent)=>{if(this.frozen||!this.visible)return;const r=cv.getBoundingClientRect();this.mx=e.clientX-r.left;this.my=e.clientY-r.top;};
  const leave=()=>{this.mx=-1e4;};
  const down=()=>{if(!this.frozen)this.pulse=1;};
  window.addEventListener('pointermove',move,{passive:true});document.documentElement.addEventListener('pointerleave',leave,{passive:true});parent.addEventListener('pointerdown',down,{passive:true});
  this.cleanup.push(()=>{window.removeEventListener('pointermove',move);document.documentElement.removeEventListener('pointerleave',leave);parent.removeEventListener('pointerdown',down);});
  const resize=new ResizeObserver(()=>this.resize());resize.observe(parent);this.cleanup.push(()=>resize.disconnect());
  const io=new IntersectionObserver(([entry])=>{this.visible=entry.isIntersecting;this.schedule();},{rootMargin:'80px'});io.observe(cv);this.cleanup.push(()=>io.disconnect());
  const vis=()=>this.schedule();document.addEventListener('visibilitychange',vis);this.cleanup.push(()=>document.removeEventListener('visibilitychange',vis));
  // A theme switch repaints a static (reduced-motion) stage; the live loop reads the theme every frame anyway.
  const theme=new MutationObserver(()=>{if(this.frozen)this.paint();});theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});this.cleanup.push(()=>theme.disconnect());
  const fonts=document.fonts?.load?Promise.all([document.fonts.load(`600 120px ${FONT}`),loadSymbol()]):loadSymbol();
  void fonts.catch(()=>null).then(()=>{if(this.disposed)return;this.fontsReady=true;this.ready=false;this.resize();});
 }
 dispose(){this.disposed=true;cancelAnimationFrame(this.raf);this.raf=0;for(const fn of this.cleanup)fn();}

 private resize(){
  if(!this.fontsReady||this.disposed)return;
  const r=this.cv.getBoundingClientRect();if(r.width<10||r.height<10)return;
  if(Math.abs(r.width-this.W)<1&&Math.abs(r.height-this.H)<1&&this.ready)return;
  this.W=r.width;this.H=r.height;this.dpr=Math.min(2,window.devicePixelRatio||1);this.k=grainScale(this.W,this.H);
  this.N=this.requestedCount??grainCount(this.W,this.H);this.setLevel(this.level);
  this.cv.width=Math.round(this.W*this.dpr);this.cv.height=Math.round(this.H*this.dpr);
  this.build();this.assign(false);this.ready=true;
  if(this.frozen)this.snap();this.schedule();
 }
 private off(draw:Draw){
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(this.W));c.height=Math.max(1,Math.round(this.H));
  const x=c.getContext('2d',{willReadFrequently:true})!;x.textBaseline='alphabetic';draw(x,c.width,c.height);return x.getImageData(0,0,c.width,c.height);
 }
 /** Jittered-grid stipple of the drawn shape. Spacing comes from the shape's area, so density is uniform across shapes. */
 private sample(draw:Draw,n:number,jit:number,cls:Classify,rand:()=>number):Point[]{
  const img=this.off(draw),W=img.width,H=img.height,d=img.data;let area=0;
  for(let i=3;i<d.length;i+=4)if(d[i]>140&&(!cls||cls(d[i-3],d[i-2],d[i-1])>=0))area++;
  if(!area||!n)return [];
  let sp=Math.max(2.4*this.k,Math.sqrt(area/n)*.97),pts:Point[]=[];
  for(let it=0;it<9;it++){
   pts=[];
   for(let y=sp/2;y<H;y+=sp)for(let x=sp/2;x<W;x+=sp){
    const jx=x+(rand()-.5)*sp*jit,jy=y+(rand()-.5)*sp*jit,ix=jx|0,iy=jy|0;if(ix<0||iy<0||ix>=W||iy>=H)continue;
    const k=(iy*W+ix)*4;if(d[k+3]<=140)continue;
    const cc=cls?cls(d[k],d[k+1],d[k+2]):1;if(cc>=0)pts.push({x:jx,y:jy,c:cc});
   }
   if(pts.length>=n)break;sp*=.92;
  }
  shuffle(pts,rand);if(pts.length>n)pts.length=n;
  const base=pts.length;while(pts.length<n&&base){const q=pts[(rand()*base)|0];pts.push({x:q.x+(rand()-.5)*3*this.k,y:q.y+(rand()-.5)*3*this.k,c:q.c});}
  return pts;
 }
 private build(){
  const W=this.W,H=this.H,N=this.N,R=mulberry(11),word=this.word;
  const nF=Math.floor(N*this.floorFrac),nS=N-nF;this.nS=nS;
  // Word layout: Albert Sans 600, lowercase, -0.05em tracking like the logo wordmark, with a round period.
  const lay=(x:CanvasRenderingContext2D,w:number,h:number)=>{
   x.font=`600 360px ${FONT}`;x.letterSpacing='-18px';const m0=x.measureText(word).width;
   const sz=Math.min(360*(w*.88)/(m0+360*.2),h*.42);x.font=`600 ${sz}px ${FONT}`;x.letterSpacing=`${-sz*.05}px`;
   const m=x.measureText(word).width,x0=(w-(m+sz*.2))/2,by=h*.47+sz*.34;return {sz,m,x0,by};
  };
  const letters:Draw=(x,w,h)=>{const L=lay(x,w,h);x.fillStyle='#000';x.fillText(word,L.x0,L.by);};
  const period:Draw=(x,w,h)=>{const L=lay(x,w,h);x.fillStyle='#000';x.beginPath();x.arc(L.x0+L.m+L.sz*.12,L.by-L.sz*.085,L.sz*.085,0,Math.PI*2);x.fill();};
  const disc=(w:number,h:number)=>({cx:w/2,cy:h*.46,R0:Math.min(w*.36,h*.33)});
  const blob=(x:CanvasRenderingContext2D,cx:number,cy:number,R0:number)=>{x.beginPath();for(let i=0;i<=120;i++){const a=i/120*Math.PI*2,r=R0*(1+.05*Math.sin(3*a+1)+.035*Math.sin(5*a+2)+.02*Math.sin(2*a)),px=cx+Math.cos(a)*r,py=cy+Math.sin(a)*r;if(i)x.lineTo(px,py);else x.moveTo(px,py);}x.closePath();};
  const initial=(word[0]||'g').toUpperCase();
  const letterAt=(x:CanvasRenderingContext2D,w:number,h:number)=>{const {cx,cy,R0}=disc(w,h);x.font=`600 ${R0*1.3}px ${FONT}`;x.letterSpacing='0px';const m=x.measureText(initial).width;return {lx:cx-m/2,ly:cy+R0*.46};};
  const stoneBody:Draw=(x,w,h)=>{const {cx,cy,R0}=disc(w,h);x.fillStyle='#000';blob(x,cx,cy,R0);x.fill();x.globalCompositeOperation='destination-out';const {lx,ly}=letterAt(x,w,h);x.lineWidth=14;x.fillText(initial,lx,ly);x.strokeText(initial,lx,ly);x.globalCompositeOperation='source-over';};
  const stoneLetter:Draw=(x,w,h)=>{const {lx,ly}=letterAt(x,w,h);x.fillStyle='#000';x.fillText(initial,lx,ly);};
  const stoneRing:Draw=(x,w,h)=>{const {cx,cy,R0}=disc(w,h);x.strokeStyle='#000';x.lineWidth=8;x.setLineDash([2,15]);x.lineCap='round';x.beginPath();x.arc(cx,cy,R0*1.14,0,Math.PI*2);x.stroke();};
  const symbol:Draw=(x,w,h)=>{if(!symbolImage)return;const q=Math.min(w,h)*.8;x.drawImage(symbolImage,(w-q)/2,h*.46-q/2,q,q);};
  // Symbol colours to grain classes: orange 0, near-black 1, grey 2; white is the cut-out and stays empty.
  const symbolClass=(r:number,g:number,b:number)=>r>225&&g>225&&b>225?-1:r>190&&b<90?0:r<38&&g<38&&b<38?1:2;
  const areaOf=(draw:Draw,cls:Classify)=>{const d=this.off(draw).data;let A=0;for(let i=3;i<d.length;i+=4)if(d[i]>140&&(!cls||cls(d[i-3],d[i-2],d[i-1])>=0))A++;return A;};
  const byArea=(passes:[Draw,Classify,number][],n:number)=>{
   const areas=passes.map(p=>areaOf(p[0],p[1])),total=areas.reduce((u,v)=>u+v,0)||1;let out:Point[]=[];
   passes.forEach((p,i)=>{const pts=this.sample(p[0],Math.max(10,Math.round(n*areas[i]/total)),.4,p[1],R);if(p[2]>=0)for(const q of pts)q.c=p[2];out=out.concat(pts);});
   return fit(out,n,R);
  };
  // 1 identity: ink letters (about a tenth grey) and an orange period.
  const word1=byArea([[letters,null,1],[period,null,0]],nS);for(const q of word1)if(q.c===1&&R()<.1)q.c=2;
  // 2 on-chain: the Grainpad symbol for the default word, otherwise an orange stone with the initial and a dashed ring.
  const onchain=word===DEFAULT_WORD&&symbolImage?byArea([[symbol,symbolClass,-1]],nS):byArea([[stoneBody,null,0],[stoneLetter,null,1],[stoneRing,null,1]],nS);
  this.T=[[],word1,onchain];
  // A sand heap of floor grains along the bottom edge in the shape modes.
  const F:Point[]=[];for(let i=0;i<nF;i++){const x=R()*W,hump=(.5+.5*Math.sin(x/W*6+1.2))*.6+.4;F.push({x,y:H-5-Math.pow(R(),2.4)*H*.075*hump,c:R()<.5?0:R()<.55?1:2});}
  this.F=F;
  if(!this.x||this.x.length!==N){
   this.x=new Float32Array(N);this.y=new Float32Array(N);this.vx=new Float32Array(N);this.vy=new Float32Array(N);this.tx=new Float32Array(N);this.ty=new Float32Array(N);
   this.s=new Float32Array(N);this.a=new Float32Array(N);this.ph=new Float32Array(N);this.dir=new Float32Array(N);this.sp=new Float32Array(N);this.sw=new Float64Array(N);
   this.c=new Uint8Array(N);this.nc=new Uint8Array(N);this.fl=new Uint8Array(N);
   this.rank=new Uint32Array(N);for(let i=0;i<N;i++)this.rank[i]=i;for(let i=N-1;i>0;i--){const j=(R()*(i+1))|0,t=this.rank[i];this.rank[i]=this.rank[j];this.rank[j]=t;}
   for(let i=0;i<N;i++){const f=F[i<nS?(R()*Math.max(1,nF))|0:i-nS]||{x:R()*W,y:H-5,c:0};this.x[i]=f.x;this.y[i]=f.y;this.tx[i]=f.x;this.ty[i]=f.y;this.c[i]=this.nc[i]=f.c;this.s[i]=2.1+R()*2.6;this.a[i]=R()*6.28;this.ph[i]=R()*6.28;this.dir[i]=R()*6.28;this.sp[i]=.5+R()*1.5;}
  }
  for(let i=0;i<N;i++)this.fl[i]=i>=nS?1:0;
 }
 private assign(burst:boolean){
  const now=performance.now(),m=this.mode,T=this.T[m],N=this.N;
  this.free=m===0;this.cv.classList.toggle('is-free',this.free);
  if(this.free){
   for(let i=0;i<N;i++){const r=Math.random();this.nc[i]=r<.5?0:r<.82?1:2;this.dir[i]=Math.random()*6.28;
    if(burst){this.sw[i]=now+Math.random()*420;this.vx[i]+=(Math.random()-.5)*5;this.vy[i]+=(Math.random()-.5)*5;}
    else{this.c[i]=this.nc[i];this.x[i]=Math.random()*this.W;this.y[i]=Math.random()*this.H;}}
   return;
  }
  for(let i=0;i<N;i++){
   if(this.fl[i]){const f=this.F[i-this.nS]||this.F[0];if(f){this.tx[i]=f.x;this.ty[i]=f.y;this.nc[i]=f.c;}}
   else{const t=T[i]||T[0];if(!t)continue;this.tx[i]=t.x;this.ty[i]=t.y;this.nc[i]=t.c;}
   if(burst){this.sw[i]=now+Math.random()*420;this.vx[i]+=(Math.random()-.5)*7;this.vy[i]+=-Math.random()*8-2;}else this.c[i]=this.nc[i];
  }
 }
 setMode(m:GrainMode){if(m===this.mode)return;this.mode=m;if(!this.ready)return;this.assign(true);if(this.frozen)this.snap();this.schedule();}
 setWord(w:string){if(w===this.word)return;this.word=w;if(!this.ready||this.W<10)return;this.build();this.assign(true);if(this.frozen)this.snap();this.schedule();}
 setPalette(p:GrainPalette){this.palette=p;if(this.frozen)this.paint();}
 kick(){if(this.frozen||!this.ready)return;for(let i=0;i<this.N;i++){this.dir[i]+=(Math.random()-.5)*2.2;this.vx[i]+=(Math.random()-.5)*6;this.vy[i]+=(Math.random()-.5)*6;}this.schedule();}
 /** Reduced motion or the static quality level: grains sit on their targets; the idea mode is a static scatter. */
 private snap(){
  if(!this.ready)return;
  for(let i=0;i<this.N;i++){if(this.free){this.x[i]=Math.random()*this.W;this.y[i]=Math.random()*this.H;}else{this.x[i]=this.tx[i];this.y[i]=this.ty[i];}this.vx[i]=this.vy[i]=0;this.c[i]=this.nc[i];this.sw[i]=0;}
  this.paint();
 }
 /** Reduced motion and the last quality level both mean one static frame. */
 private get frozen(){return this.reduce||this.level>=STATIC_LEVEL;}
 private setLevel(level:number){
  this.level=Math.max(this.level,level);const step=GRAIN_LEVELS[this.level];
  this.active=Math.round(this.N*step.share);this.gate=frameGate(step.fps);this.cv.dataset.grainLevel=String(this.level);
  this.wFrames=this.wInterval=this.wWork=0;this.wSkip=1;
 }
 /** About one second of frames over budget steps quality down; it never steps back up in this session. */
 private observe(interval:number,work:number){
  if(interval>250){this.wFrames=this.wInterval=this.wWork=0;return;}
  this.wFrames++;this.wInterval+=interval;this.wWork+=work;
  if(this.wFrames<windowFrames(this.level))return;
  const skip=this.wSkip>0;this.wSkip=Math.max(0,this.wSkip-1);
  const next=skip?this.level:nextGrainLevel(this.level,{frames:this.wFrames,totalIntervalMs:this.wInterval,totalWorkMs:this.wWork});
  this.wFrames=this.wInterval=this.wWork=0;
  if(next>this.level){this.setLevel(next);try{sessionStorage.setItem(LEVEL_KEY,String(this.level));}catch{/* The level still holds for this stage. */}if(this.frozen)this.snap();}
 }
 private running(){return this.ready&&this.visible&&!document.hidden&&!this.frozen&&!this.disposed;}
 private schedule(){
  if(this.running()){if(!this.raf){this.last=performance.now();this.wSkip=Math.max(this.wSkip,1);this.raf=requestAnimationFrame(this.frame);}}
  else{cancelAnimationFrame(this.raf);this.raf=0;if(this.frozen&&this.ready)this.paint();}
 }
 private frame=(t:number)=>{
  this.raf=0;if(!this.running())return;
  // At most 30 fps (design/brand-system.md), lower on weak devices; physics is time-scaled, so motion keeps its speed.
  if(t-this.last<this.gate){this.raf=requestAnimationFrame(this.frame);return;}
  const interval=t-this.last,started=performance.now(),f=Math.min(2.5,Math.max(0,interval/16.67));this.last=t;
  const mx=this.mx,my=this.my,RR=this.pulse>0?190:105,R2=RR*RR,k=.017*f,damp=Math.pow(.86,f),N=this.N,free=this.free,W=this.W,H=this.H,tt=t*.001;
  this.pulse=Math.max(0,this.pulse-.04*f);
  const {x,y,vx,vy,tx,ty,ph,dir,sp,sw,c,nc,fl,a}=this,rank=this.rank!,active=this.active;
  for(let i=0;i<N;i++){
   if(rank[i]>=active)continue;
   if(sw[i]&&t>sw[i]){c[i]=nc[i];sw[i]=0;}
   if(free){dir[i]+=(Math.random()-.5)*.16*f;const tvx=Math.cos(dir[i])*sp[i],tvy=Math.sin(dir[i])*sp[i];vx[i]+=(tvx-vx[i])*.05*f;vy[i]+=(tvy-vy[i])*.05*f;}
   else{const wob=fl[i]?0:.9*this.k;vx[i]+=(tx[i]+Math.sin(tt*1.1+ph[i])*wob-x[i])*k;vy[i]+=(ty[i]+Math.cos(tt*.9+ph[i])*wob-y[i])*k;}
   const dx=x[i]-mx,dy=y[i]-my,d2=dx*dx+dy*dy;
   if(d2<R2&&d2>.01){const d=Math.sqrt(d2),q=1-d/RR,fo=q*q*(this.pulse>0?7:3.6)*f;vx[i]+=dx/d*fo-dy/d*fo*.35;vy[i]+=dy/d*fo+dx/d*fo*.35;}
   if(free){vx[i]*=.995;vy[i]*=.995;}else{vx[i]*=damp;vy[i]*=damp;}
   x[i]+=vx[i]*f;y[i]+=vy[i]*f;a[i]+=(vx[i]+vy[i])*.015;
   if(free){if(x[i]<-6)x[i]=W+6;else if(x[i]>W+6)x[i]=-6;if(y[i]<-6)y[i]=H+6;else if(y[i]>H+6)y[i]=-6;}
  }
  this.paint();
  this.observe(interval,performance.now()-started);
  if(this.running())this.raf=requestAnimationFrame(this.frame);
 };
 /** Grains are grouped by colour and by one of six angles: one transform per group (18 a frame) instead of one per
 * grain. Each grain is drawn at its counter-rotated position, so it lands where it belongs, rotated. */
 private bucket:Uint8Array|null=null;
 private paint(){
  if(!this.ready)return;
  const ctx=this.ctx,dpr=this.dpr,dark=this.palette==='theme'&&document.documentElement.dataset.theme==='dark',quarter=Math.PI/2;
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,this.cv.width,this.cv.height);
  const {x,y,s,a,c,k}=this,N=this.N,rank=this.rank!,active=this.active;
  if(!this.bucket||this.bucket.length!==N)this.bucket=new Uint8Array(N);
  const bucket=this.bucket;
  for(let i=0;i<N;i++){const turn=a[i]%quarter;bucket[i]=((turn<0?turn+quarter:turn)/quarter*ROTATIONS)%ROTATIONS|0;}
  for(let ci=0;ci<3;ci++){
   ctx.fillStyle=ci===0?GRAIN_ORANGE:ci===1?(dark?INK_DARK:INK_LIGHT):(dark?GREY_DARK:GREY_LIGHT);
   for(let r=0;r<ROTATIONS;r++){
    const angle=r/ROTATIONS*quarter,co=Math.cos(angle),si=Math.sin(angle);
    ctx.setTransform(co*dpr,si*dpr,-si*dpr,co*dpr,0,0);
    for(let i=0;i<N;i++){if(c[i]!==ci||bucket[i]!==r||rank[i]>=active)continue;const size=s[i]*k,h=size/2,px=x[i]*co+y[i]*si,py=-x[i]*si+y[i]*co;ctx.fillRect(px-h,py-h,size,size);}
   }
  }
  ctx.setTransform(1,0,0,1,0,0);
 }
}
function shuffle<T>(list:T[],rand:()=>number){for(let i=list.length-1;i>0;i--){const j=(rand()*(i+1))|0;const t=list[i];list[i]=list[j];list[j]=t;}return list;}
function fit(points:Point[],n:number,rand:()=>number){const base=points.length;while(points.length<n&&base)points.push(points[(rand()*base)|0]);points.length=Math.min(points.length,n);return shuffle(points,rand);}

/** Decorative canvas. Meaning is carried by the text next to it; `kick` increments to stir the grains. */
export function GrainStage({mode,word,palette='theme',count,floor=.16,kick=0,className}:{mode:GrainMode;word:string;palette?:GrainPalette;count?:number;floor?:number;kick?:number;className?:string}){
 const canvas=useRef<HTMLCanvasElement>(null),stage=useRef<Stage|null>(null),initial=useRef({mode,word,palette,count,floor});
 useEffect(()=>{
  const node=canvas.current;if(!node||!node.getContext('2d'))return;
  const o=initial.current;
  // Count from the stage's own size (grainCount): smaller stages draw smaller, denser grains.
  const instance=new Stage(node,{count:o.count,floor:o.floor,palette:o.palette,word:o.word,mode:o.mode});
  stage.current=instance;return()=>{instance.dispose();stage.current=null;};
 },[]);
 useEffect(()=>{stage.current?.setMode(mode);},[mode]);
 useEffect(()=>{stage.current?.setWord(word);},[word]);
 useEffect(()=>{stage.current?.setPalette(palette);},[palette]);
 useEffect(()=>{if(kick)stage.current?.kick();},[kick]);
 return <div className={`grain-stage${className?` ${className}`:''}`} aria-hidden="true"><canvas ref={canvas}/></div>;
}
