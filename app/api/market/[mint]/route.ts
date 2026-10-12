import {serverMarket,type MarketIdentity,type MarketView} from '@/lib/server-market';
import {marketFailure} from '@/lib/native-market.mjs';
import {database} from '@/lib/server-owner';
import {identityCards} from '@/lib/wallet-identity.mjs';
export const dynamic='force-dynamic';
function identityOf(market:MarketView):MarketIdentity{
 return {mint:market.mint,name:market.name,symbol:market.symbol,image:market.image,creator:market.creator||null,createdAt:market.createdAt||null,quoteSymbol:market.quote?.symbol||'SOL'};
}
export async function GET(request:Request,{params}:{params:Promise<{mint:string}>}){
 const headers={'Cache-Control':'no-store'};
 try{
  const {mint}=await params;
  const market=await serverMarket(mint,{viewer:request.headers.get('X-Grainpad-Viewer')==='visible'});
  let creatorIdentity=null;try{if(market.creator)creatorIdentity=(await identityCards(database(),[market.creator],{limit:1}))[market.creator]||null;}catch{creatorIdentity=null;}
  return Response.json({status:market.stale?'stale':'ready',identity:identityOf(market),creatorIdentity,market:{...market,creatorIdentity}},{headers});
 }catch(error){
  const failure=marketFailure(error);
  const http=failure.status==='not_registered'?404:failure.identity?200:503;
  return Response.json({status:failure.status,identity:failure.identity,market:null,error:failure.error},{status:http,headers});
 }
}
