import {BRAND_CHAIN} from "@/lib/brand-presentation";
import type { Metadata } from "next";
import { DocsContent } from "@/components/docs-content";
import { POLICY, grainpadPlatformId } from "@/lib/platform-policy";
import { SITE } from "@/lib/site-config";
import "./docs.css";
import {env} from "cloudflare:workers";
import {GRAINPAD_SOL_LOOKUP_TABLE} from "@/lib/sol-route-lookup-policy.mjs";
export const dynamic="force-dynamic";

export const metadata: Metadata = {
  title: "Docs — grainpad",
  description: `grainpad launch mechanics, fees, graduation, treasury policy and addresses to verify on ${BRAND_CHAIN.label}.`,
  alternates: { canonical: `${SITE.origin}/docs` },
};

export default function DocsPage() {
  return <DocsContent solTradingEnabled={(env as unknown as {SOL_TRADING_ENABLED?:string}).SOL_TRADING_ENABLED==="true"} solLookupConfigured={Boolean(GRAINPAD_SOL_LOOKUP_TABLE)} platformId={grainpadPlatformId().toBase58()} rates={{
    creator: POLICY.creatorRate / 10000,
    platform: POLICY.platformRate / 10000,
    protocol: POLICY.protocolRate / 10000,
  }}/>;
}
