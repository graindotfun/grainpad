import {Check} from "lucide-react";

/** Shared, display-only step indicator for every launch mode. It never gates an action. */
export function LaunchSteps({steps,current,label="Launch steps"}:{steps:string[];current:number;label?:string}){
 return <ol className="launch-steps" aria-label={label}>{steps.map((step,index)=>{const n=index+1,state=n<current?"done":n===current?"current":"upcoming";return <li key={step} data-state={state} aria-current={state==="current"?"step":undefined}><span className="launch-steps-mark" aria-hidden="true">{state==="done"?<Check size={13}/>:String(n).padStart(2,"0")}</span><span className="launch-steps-label">{step}</span></li>;})}</ol>;
}
