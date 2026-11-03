'use client';
import {useState} from 'react';
import {IdentityName} from './identity-name';
import {ArrowUpRight,Check,ChevronDown,Copy,Share2,ShieldCheck} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator,DropdownMenuTrigger} from './ui/dropdown-menu';
import {TokenImage} from './token-image';
import {BRAND_ASSETS} from '@/lib/brand-assets';
import {grainImpersonation} from '@/lib/launch-identity.mjs';
import {SITE} from '@/lib/site-config';
import {TokenLaunchPost} from './token-launch-post';
import type {MarketIdentity,MarketView} from '@/lib/server-market';
import {ChainLogo} from './chain-logo';
import {KeepCase} from './keep-case';
export type TokenNetworkContext={chain:'robinhood';networkId:'robinhood:mainnet';label:string;quoteSymbol:string;venue:string;creationTransaction:string;admitted:boolean};
export type TokenTab='market'|'tape'|'room'|'receipt';
/** Launch identity from #39's /api/market response, kept when the market read fails. */
export type TokenIdentity=Pick<MarketIdentity,'name'|'symbol'|'image'>&{quoteSymbol?:string};
/** Token identity, contract address, section tabs, one Share menu and one Verify menu.
 * External destinations live only inside Verify so the header never becomes a row of equal-weight pills. */
export function TokenHeader({mint,market,identity=null,status,active='market',networkContext}:{mint:string;market:MarketView|null;identity?:TokenIdentity|null;status?:string;active?:TokenTab;networkContext?:TokenNetworkContext}){
 const [copied,setCopied]=useState(''),[copyError,setCopyError]=useState(false);
 const symbol=market?.symbol||identity?.symbol||'',pageUrl=`${SITE.origin}${networkContext?`/network/robinhood/mainnet/token/${mint}`:`/token/${mint}`}`,graduated=market?.route==='cpmm';
 async function copy(text:string,label:string){try{await navigator.clipboard.writeText(text);setCopied(label);setCopyError(false);setTimeout(()=>setCopied(''),1800);}catch{setCopyError(true);}}
 async function nativeShare(){try{await navigator.share({title:symbol?`$${symbol} on grainpad`:'grainpad token',url:pageUrl});}catch{/* Share sheet dismissed. */}}
 const tabs:[TokenTab,string,string][]=networkContext?[['market','Market',`/network/robinhood/mainnet/token/${mint}`],['tape','Tape','#public-tape'],['receipt','Receipt','#launch-receipt']]:[['market','Market',`/token/${mint}`],['tape','Tape',active==='market'?'#public-tape':`/token/${mint}#public-tape`],['room','Room',`/token/${mint}/room`],['receipt','Receipt',`/token/${mint}/receipt`]];
 const verify:[string,string][]=networkContext?[['Robinhood Explorer',`https://robinhoodchain.blockscout.com/token/${mint}`],['Launch transaction',`https://robinhoodchain.blockscout.com/tx/${networkContext.creationTransaction}`]]:[
  ['Solscan',`https://solscan.io/token/${mint}`],
  ['Solana Explorer',`https://explorer.solana.com/address/${mint}`],
  [graduated?'Raydium pool':'Raydium LaunchLab',graduated&&market?`https://raydium.io/swap/?inputMint=${encodeURIComponent(market.quote.mint)}&outputMint=${encodeURIComponent(mint)}`:`https://raydium.io/launchpad/token/?mint=${encodeURIComponent(mint)}`],
  ...(market?[['GeckoTerminal',market.links?.gecko||`https://www.geckoterminal.com/solana/pools/${market.pool}`] as [string,string]]:[]),
  ...(market?.links?.dexscreener?[['Dexscreener',market.links.dexscreener] as [string,string]]:[]),
 ];
 const progress=market?.progress&&Number(market.progress.target)>0?Number(market.progress.raised)/Number(market.progress.target)*100:null;
 const chip:[string,string]|null=networkContext?[networkContext.admitted?'is-graduated':'is-quiet',networkContext.admitted?'verified launch':'verification pending']:!market?null:market.route==='cpmm'?['is-graduated','graduated']:market.route==='graduating'?['is-graduating','graduating']:progress!==null&&progress>=80?['is-graduating','near graduation']:['is-new','bonding curve'];
 return <header className="token-header gx-token-header">
  <div className="token-header-identity">
   <TokenImage src={market?.official?BRAND_ASSETS.token:market?.image||identity?.image||''} symbol={symbol||'?'} size={104}/>
   <div className="token-header-name">
    <div className="gx-th-chips">{market?.official&&<span className="gx-chip is-graduated">official</span>}{chip&&<span className={`gx-chip ${chip[0]}`}>{chip[1]}</span>}<span className="gx-chip is-quiet"><ChainLogo chain={networkContext?.chain??"solana"} networkId={networkContext?.networkId??"solana:mainnet-beta"}/>{networkContext?.label??"Solana"}</span>{networkContext&&<span className="gx-chip is-quiet"><KeepCase>{networkContext.quoteSymbol+" pair"}</KeepCase></span>}{market&&<span className="gx-chip is-quiet"><KeepCase>{`${market.quote.symbol} pair`}</KeepCase></span>}</div>
    <h1><span className="gx-th-title">{market?.name||identity?.name||(status==='not_registered'?'Not a grainpad launch':'Token market')}</span>{symbol&&<span className="gx-th-symbol">${symbol}</span>}</h1>
    <p>{market&&grainImpersonation(market)&&<strong>Not the official GRAIN · </strong>}{networkContext?`${networkContext.quoteSymbol} pair · ${networkContext.venue}`:market?`${market.quote.symbol} pair · ${graduated?'raydium pool':'raydium launchlab curve'}`:status==='not_registered'?'This mint is not a registered grainpad launch.':identity?`$${identity.symbol} · ${identity.quoteSymbol||'SOL'} pair · market unavailable`:status==='unavailable'?'Market unavailable':'Loading token…'}</p>
    <button className="token-ca" onClick={()=>void copy(mint,'ca')} aria-label={copied==='ca'?'Contract address copied':'Copy contract address'} title={mint}>
     <span className="token-ca-label">ca</span><code>{mint}</code>{copied==='ca'?<Check size={13}/>:<Copy size={13}/>}<span className="token-ca-copy">{copied==='ca'?'copied':'copy'}</span>
    </button>
    <span className="sr-only" role="status">{copyError?'Copy unavailable. Select the address to copy it.':copied?'Copied.':''}</span>
   </div>
  </div>
  
  {!networkContext&&status!=='not_registered'&&<TokenLaunchPost mint={mint}/>}
  {status!=='not_registered'&&<div className="token-header-bar">
   {/* Section buttons, not tabs: the page you are on is not repeated as a button. */}
   <nav className="token-tabs" aria-label="Token sections">{tabs.filter(([key])=>key!==active).map(([key,label,href])=><a key={key} href={href}>{key==='market'&&<span aria-hidden="true">←</span>}{label}{key==='tape'&&active==='market'&&<span aria-hidden="true">↓</span>}</a>)}</nav>
   <div className="token-header-actions">
    <DropdownMenu><DropdownMenuTrigger className="token-action" aria-label="Share this token"><Share2 size={14}/><span>Share</span></DropdownMenuTrigger>
     <DropdownMenuContent align="end" className="token-menu">
      <DropdownMenuItem onSelect={()=>void copy(pageUrl,'link')}>{copied==='link'?'Link copied':'Copy link'}</DropdownMenuItem>
      <DropdownMenuItem asChild><a href={`https://x.com/intent/post?text=${encodeURIComponent(symbol?`$${symbol} on grainpad`:'On grainpad')}&url=${encodeURIComponent(pageUrl)}`} target="_blank" rel="noreferrer">Post on X <ArrowUpRight size={13}/></a></DropdownMenuItem>
      {!networkContext&&<DropdownMenuItem asChild><a href={`/api/og/token/${mint}`} target="_blank" rel="noreferrer">Share card image <ArrowUpRight size={13}/></a></DropdownMenuItem>}
      {typeof navigator!=='undefined'&&'share' in navigator&&<DropdownMenuItem onSelect={()=>void nativeShare()}>More…</DropdownMenuItem>}
     </DropdownMenuContent>
    </DropdownMenu>
    <DropdownMenu><DropdownMenuTrigger className="token-action" aria-label="Verify this token elsewhere"><ShieldCheck size={14}/><span>Verify</span><ChevronDown size={13}/></DropdownMenuTrigger>
     <DropdownMenuContent align="end" className="token-menu">
      <DropdownMenuLabel>On grainpad</DropdownMenuLabel>
      <DropdownMenuItem asChild><a href={networkContext?`/api/robinhood/mainnet/provenance?token=${mint}`:`/token/${mint}/proof`}>Launch proof</a></DropdownMenuItem>
      {market?.creatorIdentity&&<DropdownMenuItem asChild><a href={`/u/${market.creatorIdentity.username}`}><IdentityName identity={market.creatorIdentity} fallback={`@${market.creatorIdentity.username}`}/></a></DropdownMenuItem>}
      {market?.creator&&<DropdownMenuItem asChild><a href={`/creator/${market.creator}`}>Creator wallet</a></DropdownMenuItem>}
      <DropdownMenuSeparator/>
      <DropdownMenuLabel>Independent</DropdownMenuLabel>
      {verify.map(([label,href])=><DropdownMenuItem key={label} asChild><a href={href} target="_blank" rel="noreferrer">{label} <ArrowUpRight size={13}/></a></DropdownMenuItem>)}
     </DropdownMenuContent>
    </DropdownMenu>
   </div>
  </div>}
 </header>;
}
