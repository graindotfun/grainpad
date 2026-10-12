/** One display formatter for every market number on the site.
 * Tiny values use subscript-zero notation (0.0₇284), never scientific notation or long zero runs.
 * Display only: never feed these strings back into quotes, amounts or transactions. */
const SUBSCRIPT='₀₁₂₃₄₅₆₇₈₉';
const subscript=(n:number)=>String(n).split('').map(d=>SUBSCRIPT[Number(d)]).join('');
export const DASH='—';
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
/** Significant-digit form for |value| < 1000, subscript zeros below 0.0001. */
function small(abs:number,sig:number){
 const [mantissa,exponent]=abs.toExponential(sig-1).split('e'),e=Number(exponent);
 if(e<-4){const digits=mantissa.replace('.','').replace(/0+$/,'')||'0';return `0.0${subscript(-e-1)}${digits}`;}
 return Number(abs.toPrecision(sig)).toLocaleString('en-US',{maximumFractionDigits:Math.max(0,sig-1-e),useGrouping:true});
}
function compact(abs:number,sig:number){
 const [n,s]=abs>=1e12?[abs/1e12,'T']:abs>=1e9?[abs/1e9,'B']:abs>=1e6?[abs/1e6,'M']:[abs/1e3,'K'];
 const text=Number(n.toPrecision(Math.max(3,sig-1))).toLocaleString('en-US',{maximumFractionDigits:2});
 return text+s;
}
export type FormatOptions={sig?:number;prefix?:string;suffix?:string;compactFrom?:number};
/** Prices, amounts and values. 4 significant digits by default; tables use 3–4. */
export function formatNumber(value:number|null|undefined,{sig=4,prefix='',suffix='',compactFrom=10_000}:FormatOptions={}):string{
 if(!finite(value))return DASH;
 if(value===0)return `${prefix}0${suffix}`;
 const abs=Math.abs(value),sign=value<0?'-':'';
 const body=abs>=compactFrom?compact(abs,sig):abs>=1000?Math.round(abs).toLocaleString('en-US'):small(abs,sig);
 return `${sign}${prefix}${body}${suffix}`;
}
export const formatPrice=(value:number|null|undefined,unit?:string,sig=4)=>unit==='USD'||unit==='usd'?formatNumber(value,{sig,prefix:'$'}):formatNumber(value,{sig,suffix:unit?` ${unit}`:''});
export const formatUsd=(value:number|null|undefined,sig=4)=>formatNumber(value,{sig,prefix:'$',compactFrom:1000});
export const formatAmount=(value:number|null|undefined,sig=4)=>formatNumber(value,{sig,compactFrom:10_000});
/** Integer base units (string or bigint) to a display amount. Precision beyond display digits is intentionally dropped. */
export function formatUnits(raw:string|bigint|null|undefined,decimals:number,sig=4){
 if(raw===null||raw===undefined||raw==='')return DASH;
 try{const value=BigInt(raw),base=10n**BigInt(decimals),whole=value/base,fraction=value%base;return formatAmount(Number(whole)+Number(fraction)/Number(base),sig);}catch{return DASH;}
}
export function formatPercent(value:number|null|undefined,{signed=false}:{signed?:boolean}={}){
 if(!finite(value))return DASH;
 const text=`${Math.abs(value)>=100?value.toFixed(0):value.toFixed(Math.abs(value)>=10?1:2)}%`;
 return signed&&value>0?`+${text}`:text;
}
/** Compact age: now, 42s, 9m, 3h, 2d. Accepts milliseconds. */
export function relativeTime(timestampMs:number|null|undefined,now=Date.now()){
 if(!finite(timestampMs))return DASH;
 const seconds=Math.max(0,Math.floor((now-timestampMs)/1000));
 return seconds<10?'now':seconds<60?`${seconds}s`:seconds<3600?`${Math.floor(seconds/60)}m`:seconds<86400?`${Math.floor(seconds/3600)}h`:`${Math.floor(seconds/86400)}d`;
}
/** Sequential ledger number: 17 → #0017. */
export const recordNumber=(n:number)=>`#${String(Math.max(0,Math.floor(n))).padStart(4,'0')}`;
export const shortAddress=(address:string,head=4,tail=4)=>address.length>head+tail+1?`${address.slice(0,head)}…${address.slice(-tail)}`:address;
