import {PublicKey} from '@solana/web3.js';
import {database} from '@/lib/server-owner';
import {grainpadPlatformId} from '@/lib/platform-policy';
import {eventHistory,quoteCandles} from '@/lib/event-history.mjs';
export async function GET(request:Request,{params}:{params:Promise<{mint:string}>}){try{
 const mint=new PublicKey((await params).mint).toBase58(),db=database(),url=new URL(request.url),period=Number(url.searchParams.get('seconds')||300);
 if(![60,300,3600,86400].includes(period))return Response.json({error:'Invalid interval.'},{status:400});
 const row=await db.prepare('SELECT record FROM launch_index WHERE network=? AND platform_id=? AND mint=?').bind('mainnet-beta',grainpadPlatformId().toBase58(),mint).first<{record:string}>();if(!row)return Response.json({error:'No indexed launch.'},{status:404});
 const record=JSON.parse(row.record),history=await eventHistory(db,mint,{before:url.searchParams.get('before'),limit:100});
 return Response.json({...history,candles:quoteCandles(history.events,period),quote:record.quoteAsset,priceUnit:`${record.quoteAsset} per token`,volumeUnit:record.quoteAsset,notice:'Execution prices include fees. Candles cover the returned events; missing periods are not filled.'},{headers:{'Cache-Control':'public, max-age=15'}});
}catch{return Response.json({error:'Tape unavailable.'},{status:503});}}
