/** Complete the browser polyfill before evaluating any Solana/Raydium modules. */
export async function loadTrading(){
 await import('./browser-buffer.mjs');
 return import('./trade');
}
