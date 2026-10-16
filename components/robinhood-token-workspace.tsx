'use client';
import {useEffect,useState} from 'react';
import {Button} from './ui/button';
import {RobinhoodMainnetMarket} from './robinhood-mainnet-market';
import {RobinhoodMainnetHistory} from './robinhood-mainnet-history';
import {RobinhoodMarketModule} from './robinhood-market-module';
import type {MainnetLaunchRecord} from '@/lib/chain/robinhood-mainnet-registration.ts';
/** Same market/tape/swap grid as Solana. Public figures never enter wallet quote state. */
export function RobinhoodTokenWorkspace({record,admitted}:{record:MainnetLaunchRecord;admitted:boolean}){
 const [sheet,setSheet]=useState(false),[tradeBusy,setTradeBusy]=useState(false),[side,setSide]=useState<'buy'|'sell'>('buy'),[historyRevision,setHistoryRevision]=useState(0);
 useEffect(()=>{const choosing=()=>setSheet(false);window.addEventListener('grainpad-open-wallet',choosing);return()=>window.removeEventListener('grainpad-open-wallet',choosing);},[]);
 useEffect(()=>{
  if(!sheet)return;const before=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow,panel=document.getElementById('robinhood-swap');document.body.style.overflow='hidden';panel?.focus();
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setSheet(false);return;}if(event.key!=='Tab'||!panel)return;const items=[...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')].filter(el=>el.getClientRects().length>0);if(!items.length){event.preventDefault();return;}const first=items[0],last=items.at(-1)!;if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel)){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===panel)){event.preventDefault();first.focus();}};
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;before?.focus();};
 },[sheet]);
 useEffect(()=>{const media=window.matchMedia('(max-width:760px)');const change=()=>{if(!media.matches)setSheet(false);};media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 function open(direction:'buy'|'sell'){if(tradeBusy)return;setSide(direction);setSheet(true);}
 return <><div className="token-layout"><div className="token-main">
  {admitted&&<RobinhoodMarketModule record={record}/>}
  <RobinhoodMainnetHistory record={record} enabled={admitted} refreshKey={historyRevision}/>
  <section className="panel corner-panel"><div className="corner-head"><span className="corner-label">About this launch</span></div><h2>{record.name}</h2><p className="small muted">Token identity is bound on Robinhood Chain. Monero launch provenance is checked separately; trading and balances remain on Robinhood Chain.</p></section>
 </div><aside className="token-side">{sheet&&<button className="sheet-backdrop" aria-label="Close swap overlay" onClick={()=>setSheet(false)}/>}
  {admitted?<RobinhoodMainnetMarket record={record} embedded sheetOpen={sheet} onClose={()=>setSheet(false)} preferredSide={side} onBusyChange={setTradeBusy} onHistoryRefresh={()=>setHistoryRevision(n=>n+1)}/>:<section className="panel corner-panel token-swap rh-verification-pending"><div className="corner-head"><span className="corner-label">Swap · Robinhood Chain</span></div><p role="status">Monero registration is not currently verified. Trading opens after fresh verification.</p><a href={'/launch/robinhood/mainnet?recover='+record.transactionHash}>Recover this launch</a></section>}
 </aside></div>
 <div className="mobile-trade-bar" aria-label="Trade on Robinhood Chain"><Button disabled={!admitted||tradeBusy} onClick={()=>open('buy')}>Buy {record.symbol}</Button><Button variant="outline" disabled={!admitted||tradeBusy} onClick={()=>open('sell')}>Sell</Button></div></>;
}
