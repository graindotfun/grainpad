/** Browser-safe SOL route availability for the token page. Display only: the server re-verifies the
 * registered mint, its current pool and on-chain state before preparing, and again before relaying. */
export function solRouteAvailability(market,enabled=true){
 if(!market||market.quote?.symbol!=='wXMR')return {available:false,reason:''};
 if(!enabled)return {available:false,reason:'Paying with SOL is temporarily unavailable. You can trade with wXMR.'};
 if(market.route==='graduating')return {available:false,reason:'This token is migrating to Raydium. SOL and wXMR trading resume when the Raydium pool is live.'};
 if(market.route!=='curve'&&market.route!=='cpmm')return {available:false,reason:'The pool state could not be verified, so SOL routing is unavailable. You can trade with wXMR.'};
 return {available:true,reason:''};
}
