import {validMint} from '@/lib/share-data';
/** Old card URL. Rendering lives only at /api/og. */
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{mint:string}>}){
 const {mint}=await params;
 if(!validMint(mint))return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
 const kind=new URL(request.url).searchParams.get('variant')==='receipt'?'receipt':'token';
 return Response.redirect(new URL(`/api/og/${kind}/${mint}`,request.url),308);
}
