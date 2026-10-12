import { Connection } from '@solana/web3.js';
export const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export function connectionFromEnvironment() {
  const endpoint = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const url = new URL(endpoint);
  if (url.protocol !== 'https:') throw Error('A HTTPS mainnet RPC is required.');
  return new Connection(endpoint, { commitment: 'finalized', disableRetryOnRateLimit: true });
}
export async function assertMainnet(connection) {
  if (await connection.getGenesisHash() !== MAINNET_GENESIS) throw Error('Unexpected genesis; mainnet required.');
}
// RPC errors may contain authenticated endpoint URLs. CLI failures keep them out of reports.
export function safeFailure() { console.log(JSON.stringify({status:'FAIL',readOnly:true,reason:'VERIFICATION_INCOMPLETE'},null,2)); console.error('Verification failed. Check the inputs, RPC availability and current account state. RPC error details are withheld to protect endpoint credentials.'); process.exitCode = 1; }
