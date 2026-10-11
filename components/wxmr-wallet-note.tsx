'use client';
import {QUOTES} from '@/lib/quote-assets.mjs';
import {CopyText} from './copy-text';

/** Visibility help is not a balance assertion or a payment confirmation. */
export function WxmrWalletNote(){
 const mint=QUOTES.wXMR.mint;
 return <aside className="setup-note" aria-label="wXMR in Phantom">
  <strong>Don&apos;t see wXMR in Phantom?</strong>
  <p>If your finalized receipt shows wXMR delivered, check Phantom&apos;s hidden token list: open <strong>Manage token list</strong> (called <strong>Manage Tokens</strong> in some versions), check the mint, and turn on wXMR if it is listed.</p>
  <p><code title={mint}>{mint.slice(0,5)}…{mint.slice(-6)}</code> <CopyText value={mint} label="Copy full wXMR mint"/></p>
  <p>Phantom may also show &quot;unwrap @ wxmr.io&quot;: that is the wXMR issuer&apos;s own service, not grainpad&apos;s.</p>
 </aside>;
}

export function WxmrUnwrapLink(){
 return <p>To unwrap wXMR to native XMR, the issuer offers <a href="https://wxmr.io/" target="_blank" rel="noreferrer">wxmr.io ↗</a>. It is external: grainpad does not operate it and has not verified its backing or redemption.</p>;
}
