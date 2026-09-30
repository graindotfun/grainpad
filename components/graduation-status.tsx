import {Check} from 'lucide-react';
/** Trading-surface graduation state. Operational evidence stays in Docs (GraduationCoverage), not here. */
export function GraduationStatus({route}:{route:'graduating'|'cpmm'}){
 const steps:[string,'done'|'current'|'next'][]=[['Curve complete','done'],[route==='cpmm'?'Migration complete':'Migration pending',route==='cpmm'?'done':'current'],['Raydium pool live',route==='cpmm'?'done':'next']];
 return <div className="graduation-status" role="status">
  {route==='graduating'&&<p><strong>Graduating to Raydium.</strong> Trading pauses until migration finishes. Usually seconds; not guaranteed.</p>}
  <ol className="lifecycle-stepper" aria-label="Graduation lifecycle">{steps.map(([label,state])=><li key={label} data-state={state} aria-current={state==='current'?'step':undefined}><i aria-hidden="true">{state==='done'?<Check size={11} strokeWidth={3}/>:null}</i><span>{label}</span></li>)}</ol>
  <a className="text-link" href="/docs#graduation">How migration works ↗</a>
 </div>;
}
