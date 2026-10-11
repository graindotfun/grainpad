"use client";
import {useSyncExternalStore} from "react";
import {Moon,Sun} from "lucide-react";

type Theme="dark"|"light";
const storageKey="grainpad-theme";
const themeEvent="grainpad:theme";
function snapshot():Theme{return document.documentElement.dataset.theme==="light"?"light":"dark";}
function apply(theme:Theme){
 document.documentElement.dataset.theme=theme;
 document.querySelector('meta[name="theme-color"]')?.setAttribute("content",theme==="light"?"#ffffff":"#101010");
 window.dispatchEvent(new Event(themeEvent));
}
function subscribe(update:()=>void){
 const sync=(event:StorageEvent)=>{if(event.key===storageKey||event.key===null)apply(event.newValue==="light"?"light":"dark");};
 window.addEventListener(themeEvent,update);window.addEventListener("storage",sync);
 return()=>{window.removeEventListener(themeEvent,update);window.removeEventListener("storage",sync);};
}
export function ThemeToggle(){
 const theme=useSyncExternalStore(subscribe,snapshot,()=>"dark" as Theme);
 const label=theme==="dark"?"Switch to light mode":"Switch to dark mode";
 function toggle(){const next= snapshot()==="dark"?"light":"dark";apply(next);try{localStorage.setItem(storageKey,next);}catch{/* Theme switching also works when browser storage is unavailable. */}}
 return <button type="button" className="theme-toggle" aria-label={label} title={label} onClick={toggle}><Sun className="theme-sun" size={18} aria-hidden="true"/><Moon className="theme-moon" size={18} aria-hidden="true"/></button>;
}
