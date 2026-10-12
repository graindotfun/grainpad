'use client';
/** Installation links do not claim an undetected provider is connected or signing-ready. */
export function WalletAvailability(){return <p className="small muted">Choose an installed compatible wallet above. Missing one? <a className="inline-link" href="https://phantom.com/" target="_blank" rel="noreferrer">Phantom</a> · <a className="inline-link" href="https://solflare.com/" target="_blank" rel="noreferrer">Solflare</a>. Compatible Wallet Standard wallets are discovered when you open the picker. Connection alone does not approve a signature or payment.</p>;}
