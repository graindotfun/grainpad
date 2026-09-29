import {serverMarket} from '@/lib/server-market';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{mint:string}>}){
 try{const {mint}=await params;return Response.json({market:await serverMarket(mint,{viewer:request.headers.get("X-Grainpad-Viewer")==="visible"})},{headers:{'Cache-Control':'no-store'}});}
 catch(error){return Response.json({market:null,error:error instanceof Error?error.message:'Market data is unavailable.'},{headers:{'Cache-Control':'no-store'}});}
}
