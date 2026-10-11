'use client';
import {useMemo,useSyncExternalStore} from 'react';
import {Palette} from 'lucide-react';
import {chartPreferences,DEFAULT_CHART_PREFERENCES} from '@/lib/chart-candles.mjs';
type Preferences={type:'line'|'candles';up:string;down:string};
const KEY='grainpad:chart-preferences:v1',CHANGE='grainpad-chart-preferences',DEFAULT=JSON.stringify(DEFAULT_CHART_PREFERENCES);
let memory=DEFAULT,storageUnavailable=false;
function snapshot(){if(storageUnavailable)return memory;try{return localStorage.getItem(KEY)||memory;}catch{return memory;}}
function subscribe(listener:()=>void){window.addEventListener('storage',listener);window.addEventListener(CHANGE,listener);return()=>{window.removeEventListener('storage',listener);window.removeEventListener(CHANGE,listener);};}
export function useChartPreferences(){
 const stored=useSyncExternalStore(subscribe,snapshot,()=>DEFAULT),preferences=useMemo(()=>chartPreferences(stored) as Preferences,[stored]);
 const update=(patch:Partial<Preferences>)=>{memory=JSON.stringify(chartPreferences({...chartPreferences(snapshot()),...patch}));try{localStorage.setItem(KEY,memory);storageUnavailable=false;}catch{storageUnavailable=true;/* Keep the choice for this session when storage is unavailable. */}window.dispatchEvent(new Event(CHANGE));};
 return {preferences,update};
}
export function ChartPreferences({preferences,update,lineStyle,setLineStyle}:{preferences:Preferences;update:(patch:Partial<Preferences>)=>void;lineStyle?:'grains'|'line';setLineStyle?:(style:'grains'|'line')=>void}){
 return <div className="market-chart-toolbar">
  <div className="segmented" role="group" aria-label="Chart style">{setLineStyle&&<button type="button" aria-pressed={preferences.type==='line'&&lineStyle==='grains'} onClick={()=>{setLineStyle('grains');update({type:'line'});}}>Grains</button>}<button type="button" aria-pressed={preferences.type==='line'&&(!setLineStyle||lineStyle==='line')} onClick={()=>{setLineStyle?.('line');update({type:'line'});}}>Line</button><button type="button" aria-pressed={preferences.type==='candles'} onClick={()=>update({type:'candles'})}>Candles</button></div>
  {preferences.type==='candles'&&<details className="candle-color-picker" onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}}><summary><span className="candle-color-preview" aria-hidden="true"><i style={{background:preferences.up}}/><i style={{background:preferences.down}}/></span><Palette size={14} aria-hidden="true"/>Colors</summary><div className="candle-color-panel"><fieldset><legend>Candle colors</legend><label><span>Up</span><input type="color" value={preferences.up} aria-label="Up candle color" onChange={event=>update({up:event.target.value})}/></label><label><span>Down</span><input type="color" value={preferences.down} aria-label="Down candle color" onChange={event=>update({down:event.target.value})}/></label></fieldset><div className="candle-color-presets"><button type="button" onClick={()=>update({up:DEFAULT_CHART_PREFERENCES.up,down:DEFAULT_CHART_PREFERENCES.down})}>Grainpad</button><button type="button" onClick={()=>update({up:'#27c99b',down:'#f16e7a'})}>Green / red</button></div></div></details>}
 </div>;
}
