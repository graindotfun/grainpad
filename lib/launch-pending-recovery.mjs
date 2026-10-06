/** @typedef {{network:'mainnet-beta'|'devnet',mint:string,owner:string,metadataHash:string,signature:string}} LaunchReceipt */
export const PENDING_LAUNCH_KEY = 'grainpad-pending';
export function launchReceiptKey(receipt) {
  return JSON.stringify([receipt.network, receipt.mint, receipt.owner, receipt.metadataHash, receipt.signature]);
}

/** Registration observes the original receipt, never the currently connected wallet.
 * A newer receipt or an unmounted workspace must not be cleared by a late response.
 * This helper has no signing or transaction-submission capability.
 */
export function createPendingLaunchRecovery() {
  const flights = new Map();
  return {
    check(receipt, {register, storage, isCurrent}) {
      const key = launchReceiptKey(receipt);
      if (flights.has(key)) return flights.get(key);
      const flight = (async () => {
        const row = await register({network:receipt.network,mint:receipt.mint,owner:receipt.owner,metadataHash:receipt.metadataHash});
        if (!isCurrent()) return null;
        if (row.mint !== receipt.mint || !row.pool || row.creator !== receipt.owner || row.network !== receipt.network) {
          throw Error('Launch verification returned a different identity. Keep your transaction receipt.');
        }
        const stored = storage.getItem(PENDING_LAUNCH_KEY);
        if (stored && launchReceiptKey(JSON.parse(stored)) !== key) {
          throw Error('Another launch receipt is saved. Keep both receipts and check that launch before preparing another.');
        }
        storage.removeItem(PENDING_LAUNCH_KEY);
        return row;
      })();
      flights.set(key, flight);
      void flight.finally(() => {if (flights.get(key) === flight) flights.delete(key);}).catch(() => {});
      return flight;
    }
  };
}
