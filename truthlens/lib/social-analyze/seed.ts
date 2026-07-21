// Stage 2 — seed extraction. Finds the narrative(s) an account is pushing from
// its OWN posts: near-duplicate clusters (the repeated message = the campaign
// line) become seeds, each with a Unicode-safe search query for the network-
// expansion stage. Deterministic, no LLM, no network — the same posts always
// yield the same seeds (reproducibility).

import { clusterNearDuplicates, normalizeText } from "@/lib/similarity";
import type { Mention } from "@/lib/narrative/types";

export interface Seed {
  /** Representative text of the pushed message (truncated for display). */
  text: string;
  /** How many of the account's own posts carry this message. */
  posts: number;
  /** Search query used to expand across sources (top informative terms). */
  query: string;
}

const MIN_POST_LEN = 20; // ignore emoji/filler posts as seed material
const QUERY_TERMS = 4;

/** Top informative terms of a text: longest distinct normalized words —
 * a language-agnostic, deterministic proxy for informativeness. */
export function topTerms(text: string, n = QUERY_TERMS): string[] {
  const words = normalizeText(text).split(" ").filter((w) => w.length >= 4);
  const uniq = [...new Set(words)];
  return uniq.sort((a, b) => b.length - a.length || a.localeCompare(b)).slice(0, n);
}

export function extractSeeds(own: Mention[], max = 2): Seed[] {
  const material = own.filter((m) => (m.text || "").trim().length >= MIN_POST_LEN);
  if (!material.length) return [];
  const groups = clusterNearDuplicates(material, (m) => m.text)
    .sort((a, b) => b.length - a.length || a[0].text.localeCompare(b[0].text));
  const seeds: Seed[] = [];
  for (const g of groups) {
    if (seeds.length >= max) break;
    const query = topTerms(g[0].text).join(" ");
    if (!query || seeds.some((s) => s.query === query)) continue;
    seeds.push({ text: g[0].text.slice(0, 200), posts: g.length, query });
  }
  return seeds;
}
