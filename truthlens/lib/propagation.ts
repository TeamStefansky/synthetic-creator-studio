// Content-propagation tracer.
//
// Takes a distinctive sentence from the analyzed article and searches the OPEN
// web for other pages publishing the same text, to find where the content
// originated. It identifies the earliest-known publisher and flags coordinated
// amplification when republishers share the target's operator infrastructure.
//
// This traces content across the PUBLIC web only — it never touches private
// logs. It uses Anthropic's server-side web_search tool when ANTHROPIC_API_KEY
// is set; otherwise it degrades to available:false with a clear note.

import Anthropic from "@anthropic-ai/sdk";
import type { OperatorNetwork, Propagation, PropagationHit } from "./types";

/** Pick a distinctive, quotable sentence from the article text. */
export function distinctivePhrase(articleText: string): string | null {
  if (!articleText) return null;
  const sentences = articleText
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => {
      const words = s.split(/\s+/).length;
      return words >= 8 && words <= 30 && s.length <= 200;
    });
  if (sentences.length === 0) return null;
  // Prefer a sentence from the first third (usually the lede) that has some
  // specificity (a proper noun or number).
  const scored = sentences
    .slice(0, Math.max(1, Math.floor(sentences.length / 2)))
    .map((s) => ({
      s,
      score: (s.match(/[A-Z][a-z]+/g)?.length ?? 0) + (/\d/.test(s) ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.s ?? sentences[0];
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export async function tracePropagation(
  articleText: string,
  network: OperatorNetwork,
  targetDomain: string
): Promise<Propagation> {
  const phrase = distinctivePhrase(articleText);
  const empty: Propagation = {
    available: false,
    query: phrase,
    hits: [],
    earliestPublisher: null,
    earliestDate: null,
    coordinatedAmplification: false,
    note: null,
  };

  if (!phrase) {
    return { ...empty, note: "No distinctive phrase could be extracted from the article." };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ...empty,
      note: "Set ANTHROPIC_API_KEY (with web search enabled) to trace where this content was published across the open web.",
    };
  }

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      tools: [
        // Anthropic server-side web search tool.
        { type: "web_search_20250305", name: "web_search", max_uses: 3 } as never,
      ],
      messages: [
        {
          role: "user",
          content:
            `Search the web for other pages that publish this exact sentence, ` +
            `to find where it originated:\n\n"${phrase}"\n\n` +
            `Then return ONLY a JSON array (no prose, no fences) of up to 15 ` +
            `results as {"url":"...","title":"...","publishedAt":"YYYY-MM-DD or null"}. ` +
            `Include the original source if you can identify it.`,
        },
      ],
    });

    // Collect the final text output and parse the JSON array.
    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n");
    const match = text.match(/\[[\s\S]*\]/);
    const parsed: { url: string; title?: string; publishedAt?: string }[] =
      match ? JSON.parse(match[0]) : [];

    const hits: PropagationHit[] = [];
    for (const r of parsed) {
      const d = domainOf(r.url);
      if (!d) continue;
      hits.push({
        domain: d,
        url: r.url,
        title: r.title ?? null,
        publishedAt:
          r.publishedAt && /\d{4}/.test(r.publishedAt) ? r.publishedAt : null,
      });
    }

    // Earliest publisher by known date.
    const dated = hits
      .filter((h) => h.publishedAt)
      .sort((a, b) => (a.publishedAt! < b.publishedAt! ? -1 : 1));
    const earliest = dated[0] ?? null;

    // Coordinated amplification: republisher domains that appear as siblings in
    // the operator network.
    const siblingDomains = new Set(
      network.nodes.filter((n) => n.kind === "domain").map((n) => n.id)
    );
    const coordinated = hits.some(
      (h) => h.domain !== targetDomain && siblingDomains.has(h.domain)
    );

    return {
      available: true,
      query: phrase,
      hits: hits.slice(0, 15),
      earliestPublisher: earliest?.domain ?? null,
      earliestDate: earliest?.publishedAt ?? null,
      coordinatedAmplification: coordinated,
      note:
        hits.length === 0
          ? "No other publishers of this exact phrase were found."
          : null,
    };
  } catch {
    return {
      ...empty,
      note: "Content-propagation search was unavailable (web search not enabled or request failed).",
    };
  }
}
