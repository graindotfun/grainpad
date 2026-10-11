/** @typedef {{network:'mainnet-beta'|'devnet',mint:string,owner:string,metadataHash:string,signature:string,lastValidBlockHeight?:number}} LaunchReceipt */
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
    check(receipt, {register, storage, isCurrent, inspect}) {
      const key = launchReceiptKey(receipt);
      if (flights.has(key)) return flights.get(key);
      const flight = (async () => {
        if (inspect) {
          const observed = await inspect(receipt);
          if (!isCurrent()) return null;
          if (observed.status === 'failed' || observed.status === 'expired') {
            const matches = () => {
              const saved = storage.getItem(PENDING_LAUNCH_KEY);
              return !!saved && launchReceiptKey(JSON.parse(saved)) === key;
            };
            if (!matches()) throw Error('Another launch receipt is saved. Keep both receipts and check that launch before preparing another.');
            // Keep the original receipt before releasing only this settled attempt.
            storage.setItem(`grainpad-launch-history:${receipt.signature}`, JSON.stringify({receipt, status:observed.status, checkedAt:new Date().toISOString()}));
            if (!isCurrent() || !matches()) return null;
            storage.removeItem(PENDING_LAUNCH_KEY);
            return {settledStatus:observed.status};
          }
          if (observed.status !== 'finalized') throw Error(observed.reason || 'The previous transaction is still pending. Check confirmation again; no wallet signature is needed.');
        }
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
