import {CreatorDesk} from '@/components/creator-desk';
import {CrewRecord} from '@/components/crew-record';
import {SiteHeader} from '@/components/site-header';
import {walletMetadata} from '@/lib/share-metadata';
import {validMint} from '@/lib/share-data';
export async function generateMetadata({params}:{params:Promise<{owner:string}>}){const {owner}=await params;return validMint(owner)?walletMetadata(owner):{title:'Wallet · Grainpad',robots:{index:false}};}
export default async function CreatorPage({params}:{params:Promise<{owner:string}>}){const {owner}=await params;return <main className="shell product-page creator-wallet-page"><SiteHeader/><header className="product-title"><div><p className="eyebrow">WALLET / PUBLIC PROFILE</p><h1>{owner.slice(0,4)}…{owner.slice(-4)}</h1><p className="address-line">{owner}</p><p>One wallet, one public identity: the projects it launched, the work it contributed and what it was paid.</p></div><a className="token-chip" href="/fees">Connect & claim earnings</a></header><CreatorDesk owner={owner}/><CrewRecord wallet={owner}/></main>;}
