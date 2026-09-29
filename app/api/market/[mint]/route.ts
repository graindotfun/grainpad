import {serverMarket} from '@/lib/server-market';
import {nativeStats} from '@/lib/native-stats.mjs';
import {database} from '@/lib/server-owner';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{mint:string}>}){
 try{const {mint}=await params;const market=await serverMarket(mint,{viewer:request.headers.get("X-Grainpad-Viewer")==="visible"});
  // Grainpad's own index: independent of third-party market data and never a reason to fail the page.
  const native=await nativeStats(database(),market.mint).catch(()=>null);
  return Response.json({market:{...market,native}},{headers:{'Cache-Control':'no-store'}});}
 catch(error){return Response.json({market:null,error:error instanceof Error?error.message:'Market data is unavailable.'},{headers:{'Cache-Control':'no-store'}});}
}
