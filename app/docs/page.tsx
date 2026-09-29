import {BRAND_CHAIN} from "@/lib/brand-presentation";
import type { Metadata } from "next";
import { DocsContent } from "@/components/docs-content";
import { POLICY, grainpadPlatformId } from "@/lib/platform-policy";
import { SITE } from "@/lib/site-config";
import "./docs.css";

export const metadata: Metadata = {
  title: "Docs — Grainpad",
  description: `Grainpad launch mechanics, fees, graduation, treasury policy and addresses to verify on ${BRAND_CHAIN.label}.`,
  alternates: { canonical: `${SITE.origin}/docs` },
};

export default function DocsPage() {
  return <DocsContent platformId={grainpadPlatformId().toBase58()} rates={{
    creator: POLICY.creatorRate / 10000,
    platform: POLICY.platformRate / 10000,
    protocol: POLICY.protocolRate / 10000,
  }}/>;
}
