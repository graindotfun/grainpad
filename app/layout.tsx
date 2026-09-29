import {SITE} from "@/lib/site-config";
import {BRAND_CHAIN} from "@/lib/brand-presentation";
import {BRAND_ASSETS} from "@/lib/brand-assets";
import type { Metadata } from "next";
import "./globals.css";
import "./brand.css";
import "./genesis.css";
import "./claim-wallet.css";
import "./token-tape.css";
import "./theme.css";
import "./premium.css";
import "./token-market.css";
import "./token-discovery.css";
import {ContractAddressBar} from "@/components/contract-address-bar";

export const metadata: Metadata = {
  title: "Grainpad — From first idea to first block",
  description: `A considered start for your next token. Explore clear ${BRAND_CHAIN.label} launch conditions and create from your own wallet.`,
  metadataBase: new URL(SITE.origin),
  openGraph: {title:"Grainpad — Ideas into existence", description:`Create your token on ${BRAND_CHAIN.label}. Review the conditions. Your wallet. Your call.`, type:"website", url:SITE.origin, images:[{url:"/brand/grainpad-x-banner.jpg",width:1500,height:500,alt:"grainpad. — launching soon, on warm paper with an orange sphere"}]},
  twitter: {card:"summary_large_image", site:"@GrainXMR", title:"Grainpad — Ideas into existence", description:`A considered start for your next token on ${BRAND_CHAIN.label}.`, images:["/brand/grainpad-x-banner.jpg"]},
  icons: {
    icon: BRAND_ASSETS.favicon,
    shortcut: BRAND_ASSETS.favicon,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/albert-sans-latin-variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" fetchPriority="high"/>
        <meta name="theme-color" content="#0d1012"/>
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- Tiny same-origin theme initializer must run before paint to prevent theme flash. */}
        <script src="/theme-init.js"/>
      </head>
      <body className="antialiased"><ContractAddressBar/>{children}</body>
    </html>
  );
}
