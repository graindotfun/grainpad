"use client";
import {BRAND_ASSETS} from "@/lib/brand-assets";
/* eslint-disable @next/next/no-html-link-for-pages -- Native navigation avoids the deployed vinext RSC client-router failure. */
import Image from "next/image";
import {useEffect, useState, useSyncExternalStore, type ReactNode} from "react";
import {ArrowUpRight, Menu, X} from "lucide-react";
import {XLink} from "@/components/x-link";
import {ThemeToggle} from "@/components/theme-toggle";

function subscribeToPath(onChange:()=>void) {
 window.addEventListener("popstate",onChange);
 return ()=>window.removeEventListener("popstate",onChange);
}

export function SiteHeader({walletAction,textOnly=false}:{walletAction?:ReactNode;textOnly?:boolean}) {
 const [open,setOpen]=useState(false);
 const path=useSyncExternalStore(subscribeToPath,()=>window.location.pathname,()=>"");
 useEffect(()=>{if(!open)return;const close=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false)};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close)},[open]);
 return <header className={`site-header${walletAction?" has-wallet-action":""}`}>
  <a href="/" className="site-brand" aria-label="Grainpad home">{!textOnly&&<Image unoptimized src={BRAND_ASSETS.mark} width={34} height={34} alt=""/>}<span>grainpad<span className="brand-period">.</span></span></a>
  <nav className="desktop-nav" aria-label="Main navigation"><a href="/#launches">Explore</a><a href="/launch" aria-current={path==="/launch"?"page":undefined} onClick={()=>setOpen(false)}>Create a token</a><a href="/lab" aria-current={path==="/lab"?"page":undefined} onClick={()=>setOpen(false)}>Research <span className="nav-lab">LAB</span></a><a href="/fees" aria-current={path==="/fees"?"page":undefined} onClick={()=>setOpen(false)}>Creator earnings</a><a href="/treasury" aria-current={path==="/treasury"?"page":undefined}>Treasury</a><a href="/docs" aria-current={path==="/docs"?"page":undefined}>Docs</a></nav>
  <div className="site-header-actions"><XLink/><ThemeToggle/>{walletAction||<a className="header-cta" href="/launch" onClick={()=>setOpen(false)}>Open workspace <ArrowUpRight size={15}/></a>}<button className="mobile-menu-toggle" aria-label={open?"Close navigation":"Open navigation"} aria-expanded={open} aria-controls="mobile-navigation" onClick={()=>setOpen(!open)}>{open?<X size={22}/>:<Menu size={22}/>}</button></div>
  {open&&<nav id="mobile-navigation" className="mobile-navigation" aria-label="Mobile navigation"><a href="/#launches" onClick={()=>setOpen(false)}>Explore launches <ArrowUpRight size={16}/></a><a href="/launch" aria-current={path==="/launch"?"page":undefined} onClick={()=>setOpen(false)}>Create a token <ArrowUpRight size={16}/></a><a href="/lab" aria-current={path==="/lab"?"page":undefined} onClick={()=>setOpen(false)}>Research lab <ArrowUpRight size={16}/></a><a href="/fees" aria-current={path==="/fees"?"page":undefined} onClick={()=>setOpen(false)}>Creator earnings <ArrowUpRight size={16}/></a><a href="/treasury" aria-current={path==="/treasury"?"page":undefined} onClick={()=>setOpen(false)}>Treasury <ArrowUpRight size={16}/></a><a href="/docs" onClick={()=>setOpen(false)}>Docs <ArrowUpRight size={16}/></a><a href="/platform" onClick={()=>setOpen(false)}>Platform status <ArrowUpRight size={16}/></a></nav>}
 </header>;
}
