import {BUILD_COMMIT} from "@/lib/build-commit";
import {BRAND_ASSETS} from "@/lib/brand-assets";
/* eslint-disable @next/next/no-html-link-for-pages -- Preserve native site navigation. */
import Image from "next/image";
import {ArrowUpRight} from "lucide-react";
import {BRAND_CHAIN} from "@/lib/brand-presentation";
import {SITE} from "@/lib/site-config";

export function SiteFooter({textOnly=false,showResearchDisclaimer=true}:{textOnly?:boolean;showResearchDisclaimer?:boolean}={}) {
 return <footer className="brand-footer"><div className="footer-top"><a href="/" className="site-brand">{!textOnly&&<Image unoptimized src={BRAND_ASSETS.mark} width={30} height={30} alt=""/>}<span>grainpad<span className="brand-period">.</span></span></a><span>Ideas into existence.</span><nav aria-label="Footer"><a href="/launch">Workspace</a><a href="/docs">Docs</a><a href="/docs#faq">Wallets &amp; FAQ</a><a href="/platform">Platform status</a><a href="/transparency">Transparency</a><a href="/authority">Who controls what</a><a href="/roadmap">Roadmap</a><a href="/rooms">Rooms</a><a href="/markets/wxmr">wXMR market</a><a href="/rewards">Holder rewards</a><a href="/fees">Creator Desk</a><a href="/lab">Research</a><a href={SITE.twitter} target="_blank" rel="noreferrer">X / Twitter</a></nav></div><div className="footer-wordmark" aria-hidden="true">grainpad<span>.</span></div><div className="footer-bottom"><span>Independent by design.{BUILD_COMMIT&&<><br/><a href={`https://github.com/graindotfun/grainpad/commit/${BUILD_COMMIT}`} target="_blank" rel="noreferrer" title={BUILD_COMMIT}>Source (access required) · {BUILD_COMMIT.slice(0,12)}</a></>}</span><p>{BRAND_CHAIN.label} launch tools. Separate Monero research.{showResearchDisclaimer&&<><br/>Not affiliated with the original p/xmr project.</>}</p><a href="#main-content">Back to top <ArrowUpRight size={14}/></a></div></footer>;
}
