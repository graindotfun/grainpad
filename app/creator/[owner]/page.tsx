import {CreatorDesk} from '@/components/creator-desk';
import {SiteHeader} from '@/components/site-header';
export default async function CreatorPage({params}:{params:Promise<{owner:string}>}){const {owner}=await params;return <main className="shell product-page"><SiteHeader/><header className="product-title"><div><p className="eyebrow">CREATOR / PUBLIC PROFILE</p><h1>Creator Desk</h1><p className="address-line">{owner}</p></div><a className="token-chip" href="/fees">Connect & claim earnings</a></header><CreatorDesk owner={owner}/></main>;}
