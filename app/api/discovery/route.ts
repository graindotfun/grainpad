import {database} from '@/lib/server-owner';
import {grainpadPlatformId} from '@/lib/platform-policy';
import {discoveryRecords,enrichDiscovery} from '@/lib/token-discovery';
import {queryDiscovery} from '@/lib/discovery-index.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const headers={'Cache-Control':'no-store'},params=new URL(request.url).searchParams;
 const search=params.get('q')||'',filter=params.get('filter')||'all',sort=params.get('sort')||'newest',page=Number(params.get('page')||1),quote=params.get('quote')||'all';
 if(!['all','SOL','wXMR'].includes(quote)||search.length>128||!['all','new','near','graduated'].includes(filter)||!['newest','oldest','market-cap','volume'].includes(sort)||!Number.isSafeInteger(page)||page<1)return Response.json({error:'Invalid directory request.'},{status:400,headers});
 try{
  const platform=grainpadPlatformId().toBase58(),now=Date.now(),result=await queryDiscovery(database(),{platform,search,filter,sort,page,quote,now});
  const enrich=(rows:typeof result.selected)=>{const parsed=discoveryRecords(rows,platform);return enrichDiscovery(parsed.records,parsed.cache,platform,result.officialMint,now);};
  return Response.json({...result,selected:undefined,tokens:enrich(result.selected),featured:enrich(result.featured),updatedAt:now,stale:false,totalIndexed:result.total,coverage:'All indexed launches; historical completeness not yet verified.'},{headers});
 }catch(error){console.error('grainpad_discovery_error',error instanceof Error?error.message:'Unknown error');return Response.json({error:'The token directory is temporarily unavailable. Please try again.'},{status:503,headers});}
}
