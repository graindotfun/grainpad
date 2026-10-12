import { MONERO_DISCLAIMER } from "@/lib/monero-content.mjs";

export function MoneroDisclaimer() {
  return <aside className="record-disclaimer" aria-label="Independence and donation policy"><p>{MONERO_DISCLAIMER}</p></aside>;
}
