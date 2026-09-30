import {economicsBreakdown} from '@/lib/economics-breakdown.mjs';
/** Trading fee, holder tax, creator earnings and holder rewards, side by side. Values come from the approved policy. */
export function EconomicsBreakdown({compact=false}:{compact?:boolean}){
 return <dl className="economics-breakdown" aria-label="Fees, tax and rewards">{economicsBreakdown().map(row=><div key={row.id}><dt>{row.title} · <strong>{row.value}</strong></dt>{!compact&&<dd>{row.detail}</dd>}</div>)}</dl>;
}
