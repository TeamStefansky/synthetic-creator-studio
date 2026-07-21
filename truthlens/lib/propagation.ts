// Content-propagation tracer - OPEN WEB ONLY (no private logs). Takes a
// distinctive quote and finds other pages publishing the same text, then
// identifies the earliest-known publisher as the likely origin.
//
// Uses the Anthropic web_search server tool when ANTHROPIC_API_KEY is present.
// Degrades gracefully (Wayback-only / "limited") when unavailable.

import Anthropic from "@anthropic-ai/sdk";
import { LLM_MODEL } from "./llm";
import { getJson } from "./http";
import type { PropagationResult, PropagationHit } from "./types";

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url;
  }
}

/** Earliest Wayback snapshot date for a domain (for origin dating). */
async function waybackFirstSeen(domain: string): Promise<string | undefined> {
  const data = await getJson<string[][]>(
    `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(
      domain,
    )}*&output=json&limit=1&fl=timestamp&sort=oldest`,
  );
  const ts = data?.[1]?.[0];
  if (ts && ts.length >= 8) return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
  return undefined;
}

async function searchOpenWeb(quote: string): Promise<PropagationHit[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return [];
  try {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 } as any],
      messages: [
        {
          role: "user",
          content: `Search the web for other pages that publish this exact sentence (verbatim or near-verbatim):

"${quote}"

Then return ONLY a JSON array (no prose, no fences) of the pages you found:
[{"url":"...","publishedAt":"YYYY-MM-DD or empty"}]
Include only real result URLs. If none, return [].`,
        },
      ],
    });
    const textBlock = [...msg.content].reverse().find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "[]";
    const m = raw.match(/\[[\s\S]*\]/);
    if (!m) return [];
    const arr = JSON.parse(m[0]) as { url: string; publishedAt?: string }[];
    return arr
      .filter((h) => h?.url)
      .map((h) => ({
        domain: domainOf(h.url),
        url: h.url,
        publishedAt: h.publishedAt || undefined,
        source: "search" as const,
      }));
  } catch {
    return [];
  }
}

export async function tracePropagation(
  quote: string,
  siblingDomains: string[] = [],
): Promise<PropagationResult> {
  const hasSearch = !!process.env.ANTHROPIC_API_KEY;
  if (!quote || quote.trim().length < 20) {
    return {
      available: false,
      quote: quote || "",
      hits: [],
      coordinatedAmplification: false,
      note: "No distinctive quote available to trace.",
    };
  }

  const hits = await searchOpenWeb(quote);

  // Backfill publication dates from Wayback for hits missing a date.
  for (const hit of hits) {
    if (!hit.publishedAt) {
      const wb = await waybackFirstSeen(hit.domain);
      if (wb) {
        hit.publishedAt = wb;
        hit.source = "wayback";
      }
    }
  }

  const dated = hits.filter((h) => h.publishedAt).sort((a, b) => a.publishedAt!.localeCompare(b.publishedAt!));
  const earliest = dated[0];

  // Coordinated amplification: many republishers overlap the operator network.
  const siblingSet = new Set(siblingDomains.map((d) => d.toLowerCase().replace(/^www\./, "")));
  const overlap = hits.filter((h) => siblingSet.has(h.domain)).length;
  const coordinatedAmplification = overlap >= 2 || hits.length >= 8;

  return {
    available: hasSearch,
    quote,
    hits,
    earliestPublisher: earliest?.domain,
    earliestDate: earliest?.publishedAt,
    coordinatedAmplification,
    note: hasSearch
      ? `Found ${hits.length} page(s) republishing this text across the open web.`
      : "Open-web propagation search needs ANTHROPIC_API_KEY (web_search). Showing limited results.",
  };
}
