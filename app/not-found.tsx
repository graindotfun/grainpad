/* eslint-disable @next/next/no-html-link-for-pages -- Native navigation, as in the site header. */
import type {Metadata} from 'next';
import {SiteHeader} from '@/components/site-header';
import {SiteFooter} from '@/components/site-footer';
export const metadata:Metadata={title:'Not found · Grainpad',robots:{index:false}};
export default function NotFound(){
 return <main className="shell product-page"><SiteHeader/><header className="product-title"><div><p className="eyebrow">404 / NOTHING HERE</p><h1>This page doesn’t exist.</h1><p>The link may be old or mistyped. Tokens live at grainpad.fun/token/ followed by their full mint address.</p></div></header>
 <div className="product-actions"><a className="token-chip" href="/markets">Browse markets</a><a className="token-chip" href="/rooms">Rooms</a><a className="token-chip" href="/">Home</a></div><p className="kernel-note">this page was composted.</p><SiteFooter/></main>;
}
