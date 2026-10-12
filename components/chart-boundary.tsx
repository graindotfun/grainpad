'use client';
import {Component,type ReactNode} from 'react';
/** Keeps a chart failure inside the chart: the token page, swap and tape stay usable, and the chart offers a retry. */
export class ChartBoundary extends Component<{children:ReactNode;resetKey?:string},{failed:boolean;key?:string}>{
 state={failed:false,key:this.props.resetKey};
 static getDerivedStateFromError(){return {failed:true};}
 static getDerivedStateFromProps(props:{resetKey?:string},state:{failed:boolean;key?:string}){return props.resetKey!==state.key?{failed:false,key:props.resetKey}:null;}
 componentDidCatch(error:unknown){console.error('Chart failed; the rest of the page is unaffected.',error);}
 render(){
  if(!this.state.failed)return this.props.children;
  return <div className="market-empty pro-chart-failed" role="status"><strong>Chart unavailable</strong><span>The chart hit an error. Prices, the swap and the tape still work.</span><button type="button" className="gx-ghost" onClick={()=>this.setState({failed:false})}>Retry chart</button></div>;
 }
}
