/** One display set for finalized pagination and confirmed catch-up. Finalized wins by signature. */
export function tapeLedgerRows(indexed=[],older=[],pending=[]){
 const finalized=[...new Map([...indexed,...older].map(event=>[event.id,event])).values()].sort((a,b)=>b.slot-a.slot||b.id.localeCompare(a.id));
 const signatures=new Set(finalized.map(event=>event.signature));
 const confirmed=[...new Map(pending.filter(event=>!signatures.has(event.signature)).map(event=>[event.id,event])).values()];
 return {finalized,confirmed};
}
/** A row's amount and the asset it is in. Only SOL and the pool's quote asset read in SOL; a fee claimed in the
 * token itself (one side of a Raydium or locked-LP claim) stays in the token, never priced at the SOL/wXMR rate. */
export function tapeRowAmount(event,poolQuote,wxmrPerSol){
 const symbol=event.quoteSymbol||poolQuote,onChain=event.display?event.display.quote:event.quoteAmount&&event.quoteDecimals!==undefined?Number(event.quoteAmount)/10**event.quoteDecimals:null;
 const inSol=onChain==null?null:symbol==='SOL'?onChain:symbol===poolQuote&&wxmrPerSol?onChain/wxmrPerSol:null;
 return {symbol,onChain,inSol};
}
