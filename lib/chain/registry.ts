import {pendingAdapter, UnknownLaunchNetworkError, type LaunchNetworkAdapter} from "./adapter.ts";
import {isLaunchNetworkId, launchNetwork, type LaunchNetworkId} from "./networks.ts";
import {createRobinhoodLaunchAdapter} from "./robinhood-adapter.ts";
import {createSolanaLaunchAdapter} from "./solana-adapter.ts";

const CLOSED = "Solana devnet is not a Grainpad launch network. Registration and trading stay on solana:mainnet-beta.";

function closedDevnet(): LaunchNetworkAdapter {
  return pendingAdapter(launchNetwork("solana:devnet"), () => "closed", CLOSED);
}

const ADAPTERS: Record<LaunchNetworkId, () => LaunchNetworkAdapter> = {
  "solana:mainnet-beta": () => createSolanaLaunchAdapter(),
  "solana:devnet": closedDevnet,
  "robinhood:testnet": createRobinhoodLaunchAdapter,
};

export function launchAdapter(networkId: string): LaunchNetworkAdapter {
  if (!isLaunchNetworkId(networkId)) throw new UnknownLaunchNetworkError(networkId);
  return ADAPTERS[networkId]();
}
