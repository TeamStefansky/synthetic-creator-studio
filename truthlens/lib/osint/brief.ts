// Brief-mode selector extraction. Paste a full investigation brief; this pulls
// out every hard selector to pivot from (AdSense pub-ids, ASNs, GA/GTM ids,
// domains) so the research orchestrator can run them all and merge one report.
// Pure + deterministic + unit-tested. Extraction only - never fabricates a
// selector that is not literally present in the text.

import { normHost } from "./adapters";

export interface Selectors {
  adsense: string[];
  ga: string[];
  asn: string[];
  domains: string[];
}

const RX = {
  adsense: /ca-pub-\d{10,}/gi,
  asn: /\bAS\d{2,7}\b/gi,
  ga: /\b(?:UA-\d{4,}-\d+|G-[A-Z0-9]{6,}|GTM-[A-Z0-9]{4,})\b/gi,
  // domain-ish tokens (incl. leading *. wildcards); validated via normHost.
  domain: /(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}/gi,
};

// TLDs/handles that are almost always noise in a brief, not investigation targets.
const NOISE = /\b(?:example\.(?:com|org)|localhost|w3\.org|schema\.org)\b/i;

function uniqCap<T>(arr: T[], cap: number): T[] {
  return [...new Set(arr)].slice(0, cap);
}

/** Extract all pivotable selectors from free-text. Caps each kind so a huge
 * brief cannot fan out unboundedly. */
export function extractSelectors(text: string, caps = { adsense: 10, ga: 10, asn: 10, domains: 15 }): Selectors {
  const t = text || "";
  const adsense = uniqCap((t.match(RX.adsense) || []).map((s) => s.toLowerCase()), caps.adsense);
  const asn = uniqCap((t.match(RX.asn) || []).map((s) => s.toUpperCase()), caps.asn);
  const ga = uniqCap((t.match(RX.ga) || []).map((s) => s.toUpperCase()), caps.ga);
  const domains = uniqCap(
    (t.match(RX.domain) || [])
      .map((s) => normHost(s.replace(/^\*\./, "")))
      .filter((d) => d && !NOISE.test(d)),
    caps.domains,
  );
  return { adsense, ga, asn, domains };
}

/** Total selector count - used to decide brief vs empty. */
export function selectorCount(s: Selectors): number {
  return s.adsense.length + s.ga.length + s.asn.length + s.domains.length;
}

/** A short label for the report's network_name, from the brief's first heading. */
export function briefTitle(text: string): string {
  const firstLine = (text || "").split(/\r?\n/).map((l) => l.replace(/^#+\s*/, "").trim()).find((l) => l.length >= 3);
  return (firstLine || "Multi-selector brief").slice(0, 120);
}
