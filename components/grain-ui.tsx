import type {ReactNode} from 'react';
import type {DiscoveryToken} from '@/lib/token-discovery';

/** Shared pieces of the D "grains" layout. Presentation only: every value comes from the caller. */
export type StatusKind='new'|'graduating'|'graduated'|'unknown';

/** Lifecycle chip: graduating = curve complete, migrating or within 80% of the target, graduated = Raydium pool. NEW is not a lifecycle state: it is the shared 12-hour launch window (`isNewLaunch`) and renders independently. */
export function tokenStatus(token:Pick<DiscoveryToken,'state'|'lifecycle'|'progress'>):{kind:StatusKind;label:string}|null{
 if(token.lifecycle==='raydium_live'||token.state==='graduated')return {kind:'graduated',label:'graduated'};
 if(token.lifecycle==='migration_pending')return {kind:'graduating',label:'migrating'};
 if(token.lifecycle==='curve_complete')return {kind:'graduating',label:'curve complete'};
 if(token.state==='graduating')return {kind:'graduating',label:'graduating'};
 if(token.state==='curve')return token.progress!==null&&token.progress>=80?{kind:'graduating',label:'graduating'}:null;
 return {kind:'unknown',label:'not read yet'};
}

export function StatusChip({kind,label}:{kind:StatusKind;label:string}){
 return <span className={`gx-chip ${kind==='unknown'?'is-quiet':`is-${kind}`}`}>{label}</span>;
}

/** Graduation progress as 24 squares, echoing the grains. Unknown progress draws empty outlines, never zero. */
export function GradSquares({progress,label,graduated=false}:{progress:number|null;label:string;graduated?:boolean}){
 const value=progress===null?null:Math.max(0,Math.min(100,progress)),filled=value===null?0:graduated?24:Math.round(value/100*24);
 return <div className={`gx-squares${value===null?' is-unknown':''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value===null?undefined:Math.round(value)} aria-valuetext={value===null?'Curve not read yet':graduated?'Graduated to Raydium':`${Math.round(value)}% raised toward graduation`}>
  {Array.from({length:24},(_,i)=><i key={i} className={i<filled?'is-on':undefined}/>)}
 </div>;
}

export function Label({children,className=''}:{children:ReactNode;className?:string}){return <p className={`gx-label ${className}`.trim()}>{children}</p>;}

export function ReceiptRows({rows}:{rows:[ReactNode,ReactNode][]}){
 return <>{rows.map(([k,v],i)=><div className="gx-receipt-row" key={i}><span>{k}</span><span>{v}</span></div>)}</>;
}
