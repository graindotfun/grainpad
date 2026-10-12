import {SiteHeader} from '@/components/site-header';
import {SiteFooter} from '@/components/site-footer';
import {TokenDiscovery} from '@/components/token-discovery';
import {readHomepageDiscovery} from '@/lib/server-homepage';
export const dynamic='force-dynamic';
/** The full launch directory. The same /api/discovery data as the home board; the first page is rendered on the server. */
export default async function Launches(){
 const initialDiscovery=await readHomepageDiscovery().catch(()=>null);
 return <main className="gx gx-launches-page"><a className="skip-content" href="#main-content">Skip to content</a><SiteHeader/>
  <div className="gx-wrap gx-page" id="main-content"><TokenDiscovery initialData={initialDiscovery}/></div>
  <SiteFooter/></main>;
}
