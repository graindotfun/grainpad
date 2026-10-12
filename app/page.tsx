import "@/app/marketing-refinements.css";
import {Home} from '@/components/homepage';
import {GET as overview} from '@/app/api/site-overview/route';
import {readHomepageDiscovery} from '@/lib/server-homepage';
import type {SiteOverviewData} from '@/components/site-overview';
export const dynamic='force-dynamic';
export default async function Page(){
 const [initialOverview,initialDiscovery]=await Promise.all([
  overview().then(async response=>response.ok?await response.json() as SiteOverviewData:null).catch(()=>null),
  readHomepageDiscovery().catch(()=>null),
 ]);
 return <Home initialOverview={initialOverview} initialDiscovery={initialDiscovery}/>;
}
