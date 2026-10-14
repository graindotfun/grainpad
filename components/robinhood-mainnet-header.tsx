import "@/app/robinhood-launch.css";
import {SiteHeader} from './site-header';
/** Market pages use the same creation entry; their EVM wallet controls stay on the page. */
export function RobinhoodMainnetHeader(){return <SiteHeader showWallet={false}/>;}
