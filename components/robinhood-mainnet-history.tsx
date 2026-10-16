'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from './ui/button';
import {formatUnits18} from '@/lib/chain/robinhood-market.ts';
import type {StoredTrade} from '@/lib/chain/robinhood-mainnet-history.ts';
import type {MainnetLaunchRecord} from '@/lib/chain/robinhood-mainnet-registration.ts';
type History={trades:StoredTrade[];nextCursor:string|null};
export function RobinhoodMainnetHistory({record,enabled=true,refreshKey=0}:{record:MainnetLaunchRecord;enabled?:boolean;refreshKey?:number}){
 const [history,setHistory]=useState<History|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const pendingRead=useRef<AbortController|null>(null);
 async function read(cursor?:string,signal?:AbortSignal){
  if(!enabled)return;pendingRead.current?.abort();const controller=new AbortController();pendingRead.current=controller;if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',()=>controller.abort(),{once:true});signal=controller.signal;
  setBusy(true);setError('');
  try{const url=new URL('/api/robinhood/mainnet/history',window.location.origin);url.searchParams.set('token',record.tokenAddress);if(cursor)url.searchParams.set('before',cursor);
   const response=await fetch(url,{signal});if(!response.ok)throw Error('Trade history is temporarily unavailable. Retry shortly.');const page=await response.json() as History;
   if(!Array.isArray(page.trades)||page.trades.some(row=>!/^0x[0-9a-f]{64}$/.test(row.transactionHash)||!/^\d{1,78}$/.test(row.amountIn)||!/^\d{1,78}$/.test(row.amountOut)))throw Error('Trade history could not be verified.');
   if(!signal?.aborted)setHistory(previous=>({trades:[...new Map([...(cursor?previous?.trades??[]:[]),...page.trades].map(row=>[row.transactionHash+':'+row.logIndex,row])).values()],nextCursor:page.nextCursor}));
  }catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:'Trade history unavailable.');}finally{if(!signal?.aborted)setBusy(false);}
 }
 useEffect(()=>{if(!enabled||refreshKey===0)return()=>pendingRead.current?.abort();const controller=new AbortController();void Promise.resolve().then(()=>{if(!controller.signal.aborted)return read(undefined,controller.signal);});return()=>{controller.abort();pendingRead.current?.abort();};
 // Initial reads are explicit. A verified wallet receipt may refresh the visible tape.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[enabled,record.tokenAddress,refreshKey]);
 return <section className="panel corner-panel public-tape" id="public-tape" aria-label="Robinhood trade history"><div className="corner-head"><span className="corner-label">Public tape</span><span className="corner-label is-right">Robinhood Chain · finalized</span></div>
  <div className="tape-heading"><h2>trade history.</h2><Button variant="outline" size="sm" disabled={busy||!enabled} onClick={()=>void read()}>{busy?'Reading…':history||error?'Refresh history':'Load history'}</Button></div>
  {!enabled?<p role="status">History opens after fresh launch verification.</p>:error?<p role="status" className="feedback error">{error}</p>:!history?<p role="status">{busy?"Reading finalized trades…":"Load finalized trades from Robinhood Chain."}</p>:history.trades.length===0?<p>No finalized trades in this interval.</p>:<div className="tape-scroll"><table className="trade-table"><thead><tr><th>Side</th><th>Amount in</th><th>Amount out</th><th>Transaction</th></tr></thead><tbody>{history.trades.map(row=><tr key={row.transactionHash+':'+row.logIndex}><td className={'trade-side '+row.side}>{row.side}</td><td>{formatUnits18(BigInt(row.amountIn))} {row.side==='buy'?'WETH':record.symbol}</td><td>{formatUnits18(BigInt(row.amountOut))} {row.side==='buy'?record.symbol:'WETH'}</td><td><a href={'https://robinhoodchain.blockscout.com/tx/'+row.transactionHash} target="_blank" rel="noreferrer">{row.transactionHash.slice(0,8)}… ↗</a></td></tr>)}</tbody></table></div>}
  {history?.nextCursor&&<Button variant="outline" disabled={busy||!enabled} onClick={()=>void read(history.nextCursor!)}>Load earlier history</Button>}
  <p className="small muted">Finalized on-chain trades. Pool recipients may be routers rather than the original trader.</p>
 </section>;
}
