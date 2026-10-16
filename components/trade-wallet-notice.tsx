'use client';
import {useSiteWallet} from './use-site-wallet';
import {openSiteWallet,walletNetworkLabel} from '@/lib/site-wallet-session.mjs';
import {Button} from './ui/button';
export function TradeWalletNotice({network}:{network:'solana'|'robinhood'}){
 const connection=useSiteWallet();if(!connection)return null;
 const expected=network==='solana'?'Solana':'Robinhood Chain';
 const compatible=network==='solana'?connection.family==='solana':connection.family==='evm'&&connection.session.chainId===4663;
 if(compatible)return <p className="trade-wallet-context"><span className="wallet-status-dot"/>{connection.name.replace(' · Wallet Standard','')} · {expected} · {connection.owner.slice(0,6)}…{connection.owner.slice(-4)}</p>;
 const active=connection.family==='solana'?'Solana':walletNetworkLabel(connection.session.chainId);
 return <div className="trade-wallet-mismatch" role="status"><strong>Connect to {expected}</strong><p>Your active wallet is on {active}. This token trades on {expected}. Connecting never approves a transaction.</p><Button variant="outline" onClick={()=>openSiteWallet(network)}>Choose {expected} wallet</Button></div>;
}
