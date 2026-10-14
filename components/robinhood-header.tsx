/* eslint-disable @next/next/no-html-link-for-pages -- Native navigation matches the deployed vinext compatibility path. */
import {ThemeToggle} from "@/components/theme-toggle";

/** This lane never mounts the Solana wallet control. */
export function RobinhoodHeader() {
  return <header className="site-header">
    <a href="/" className="site-brand" aria-label="grainpad home"><span>grainpad<span className="brand-period">.</span></span></a>
    <nav aria-label="Robinhood testnet navigation">
      <a href="/network/robinhood">Testnet tokens</a>
      <a href="/launch/robinhood">Create testnet token</a>
    </nav>
    <div className="site-header-actions"><span>Robinhood · Testnet</span><ThemeToggle/></div>
  </header>;
}
