/** Client-safe freshness for the authority ledger. No chain libraries. */
/** Older than this, the page marks every on-chain value as stale. */
export const LEDGER_STALE_AFTER_MS=15*60*1000;
/** Client-side freshness. Failed or old reads must never look current. */
export function ledgerFreshness(response,now=Date.now()){
 if(!response||response.error||!response.ledger)return {state:'failed',message:'Could not read chain state. No on-chain value on this page is current.'};
 const age=Number.isFinite(response.ledger.observedAt)?now-response.ledger.observedAt:Infinity;
 if(!response.ledger.genesisVerified)return {state:'failed',message:'The network could not be verified as Solana mainnet. On-chain values are hidden.'};
 if(response.stale||age>LEDGER_STALE_AFTER_MS)return {state:'stale',ageMs:age,message:`STALE: the last successful chain read was ${Math.round(age/60000)} minutes ago. Values may be out of date.`};
 return {state:'fresh',ageMs:age,message:null};
}
