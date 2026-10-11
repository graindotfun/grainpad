import {economicsBreakdown} from '@/lib/economics-breakdown.mjs';
/** Trading fee, holder tax, creator earnings and holder rewards, side by side. Values come from the approved policy. */
export function EconomicsBreakdown({compact=false,classicSol=false}:{compact?:boolean;classicSol?:boolean}){
 return <dl className="economics-breakdown" aria-label="Fees, tax and rewards">{economicsBreakdown().map(row=>classicSol&&row.id==='holder-tax'?{...row,value:'0%',detail:'Classic SOL tokens have no transfer tax.'}:classicSol&&row.id==='holder-rewards'?{...row,value:'None',detail:'No wXMR holder rewards apply to this SOL pair.'}:row).map(row=><div key={row.id}><dt>{row.title} · <strong>{row.value}</strong></dt>{!compact&&<dd>{row.detail}</dd>}</div>)}</dl>;
}
