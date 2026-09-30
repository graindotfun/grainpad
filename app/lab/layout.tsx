import type {Metadata} from 'next';
import {MONERO_NARRATIVE,moneroRecordSummary} from '@/lib/monero-record-status.mjs';
const description=`${MONERO_NARRATIVE} ${moneroRecordSummary()} Also: the earlier regtest-only p/xmr research.`;
export const metadata:Metadata={title:'Monero lab · Grainpad',description,openGraph:{title:'Monero lab · Grainpad',description}};
export default function Layout({children}:{children:React.ReactNode}){return children;}
