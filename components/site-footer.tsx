import {BUILD_COMMIT} from "@/lib/build-commit";
import {BRAND_ASSETS} from "@/lib/brand-assets";
/* eslint-disable @next/next/no-html-link-for-pages -- Preserve native site navigation. */
import Image from "next/image";
import {BRAND_CHAIN} from "@/lib/brand-presentation";
import {SITE} from "@/lib/site-config";

export function SiteFooter({textOnly=false,showResearchDisclaimer=true}:{textOnly?:boolean;showResearchDisclaimer?:boolean}={}) {
 return <footer className="gx-footer"><div className="gx-wrap">
  <div className="gx-footer-top">
   <a href="/" className="gx-footer-logo" aria-label="Grainpad home"><Image unoptimized src={BRAND_ASSETS.logoWordmark} width={375} height={96} alt=""/></a>
   <nav className="gx-footer-cols" aria-label="Footer">
    <div><span className="gx-label">product</span><a href="/launches">explore</a><a href="/launch">create a token</a><a href="/markets">markets</a><a href="/rooms">rooms</a><a href="/fees">creator desk</a><a href="/rewards">holder rewards</a>{!textOnly&&<a href="/lab">research lab</a>}</div>
    <div><span className="gx-label">proof</span><a href="/transparency">transparency</a><a href="/treasury">treasury</a><a href="/authority">who controls what</a><a href="/platform">platform status</a><a href="/roadmap">roadmap</a></div>
    <div><span className="gx-label">elsewhere</span><a href={SITE.twitter} target="_blank" rel="noreferrer">x</a><a href={SITE.discord} target="_blank" rel="noreferrer">discord</a><a href="/docs">docs</a><a href="/docs#faq">wallets &amp; faq</a><a href="/markets/wxmr">wXMR market</a></div>
   </nav>
  </div>
  <div className="gx-footer-bottom">
   <span>independent by design · {BRAND_CHAIN.label.toLowerCase()} launch tools · separate monero research{showResearchDisclaimer&&<> · not affiliated with the original p/xmr project</>}</span>
   <span>{BUILD_COMMIT&&<a href={`https://github.com/graindotfun/grainpad/commit/${BUILD_COMMIT}`} target="_blank" rel="noreferrer" title={BUILD_COMMIT}>source (access required) · {BUILD_COMMIT.slice(0,12)}</a>}{BUILD_COMMIT&&' · '}<a href="#main-content">back to top ↑</a></span>
  </div>
 </div></footer>;
}
