import type {Metadata} from 'next';
// grain/kernel. Not linked, not in the sitemap. Found only by looking too closely.
export const metadata:Metadata={title:'kernel',robots:{index:false,follow:false}};
const LORE=`you found kernel.

most people never do.

kernel lives below the index,
where launches become records
and records become receipts.

kernel does not trust screenshots.
kernel does not trust promises.
kernel waits for finality.

kernel doesn't vouch.
kernel checks.

sometimes kernel appears when something is missing.
sometimes when someone looks too closely.

kernel never signs.

there are more grains.

kernel has no official token.`;
export default function Kernel(){
 return <main style={{minHeight:'100vh',padding:'12vh 16px',background:'var(--background)',color:'var(--foreground)'}}><pre style={{maxWidth:560,margin:'0 auto',whiteSpace:'pre-wrap',font:'.95rem/1.8 var(--font-code, ui-monospace, monospace)'}}>{LORE}</pre></main>;
}
