import {CHAINS,type ChainKey} from '@/lib/chain-display';
/** Small chain mark placed right after a token name. Same size and baseline everywhere; the accessible label and tooltip name the chain.
 * Logos are the full-colour official marks. A chain without a committed asset shows a monogram so it is still identifiable. */
export function ChainLogo({chain,size=16,networkId}:{chain:ChainKey|null;size?:number;networkId?:string|null}){
 if(!chain)return null;
 const info=CHAINS[chain],label=info.name+(networkId==='robinhood:testnet'?' Testnet':'');
 return <span className={`gx-chain-logo is-${chain}${info.logo?'':' is-fallback'}`} role="img" aria-label={`${label} token`} title={label} style={{width:size,height:size}}>
  {/* eslint-disable-next-line @next/next/no-img-element */}
  {info.logo?<img src={info.logo} alt="" width={size} height={size} loading="lazy" decoding="async" draggable={false}/>:<span aria-hidden="true">{info.monogram}</span>}
 </span>;
}
