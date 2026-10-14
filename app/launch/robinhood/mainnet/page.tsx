import {RobinhoodMainnetLaunchV2} from '@/components/robinhood-mainnet-launch-v2';
import {ROBINHOOD_MAINNET_V3_FACTORY_ADDRESS} from '@/lib/chain/robinhood-mainnet-v3.ts';
import {RobinhoodMainnetCreate} from "@/components/robinhood-mainnet-create";
export const metadata = {title: "Launch on Robinhood Chain · grainpad", description: "Fixed-supply Robinhood mainnet tokens with Uniswap V3 trading and permanently locked liquidity.", openGraph: {title: "Launch on Robinhood Chain · grainpad", description: "Launch on Robinhood mainnet from your wallet."}, twitter: {title: "Launch on Robinhood Chain · grainpad", description: "Launch on Robinhood mainnet from your wallet."}};
export default function RobinhoodMainnetCreatePage() {return ROBINHOOD_MAINNET_V3_FACTORY_ADDRESS ? <RobinhoodMainnetLaunchV2/> : <RobinhoodMainnetCreate/>;}
