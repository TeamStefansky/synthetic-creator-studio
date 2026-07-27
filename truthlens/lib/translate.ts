// Translate short source text (feed headlines/summaries) to English so a mixed-
// language situational picture is readable. Honest capability (CLAUDE.md rule 7):
// without ANTHROPIC_API_KEY, or on any error/timeout, the ORIGINAL text is returned
// unchanged — we never fabricate a translation; untranslated text simply shows in
// its own language. Applied at the feeds' daily cache cold-path, so translation
// runs once per feed per day and the result is cached (reproducible).

import Anthropic from "@anthropic-ai/sdk";
import { LLM_MODEL, VISION_MODEL, isModelAccessError } from "@/lib/llm";
import type { FeedItem } from "@/lib/feeds/fetch";

export function translationAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const MAX_CHARS = 400; // per line sent to the model

/** Translate an array of strings to English. English strings are returned
 * unchanged (the model is told to pass them through). Returns the originals on no
 * key / parse failure / timeout — never a fabricated translation. */
export async function translateToEnglish(texts: string[]): Promise<string[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !texts.length) return texts;
  const idx = texts
    .map((t, i) => [i, (t || "").replace(/\s+/g, " ").trim()] as [number, string])
    .filter(([, t]) => t.length > 0);
  if (!idx.length) return texts;

  const system =
    "You are a translation engine. Translate each numbered line to natural English. " +
    "If a line is ALREADY English, return it verbatim. Preserve proper nouns, numbers and hashtags. " +
    "Never add commentary or explanation. Respond with ONLY minified JSON of the form " +
    '{"t":[{"i":<line number>,"en":"<english text>"}]}';
  const user = idx.map(([i, t]) => `${i}: ${t.slice(0, MAX_CHARS)}`).join("\n");

  const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 30_000 });
  // Try the primary model, then fall back to the vision model on a model-ACCESS
  // error (same pattern as Post Check) — so translation still works when the account
  // can't reach the default LLM_MODEL. Any other failure fails open to the original.
  const candidates = [...new Set([LLM_MODEL, VISION_MODEL])];
  for (const model of candidates) {
    try {
      const msg = await client.messages.create({
        model, max_tokens: 4000, system,
        messages: [{ role: "user", content: user }],
      });
      const block = msg.content.find((b) => b.type === "text");
      const raw = block && block.type === "text" ? block.text : "";
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
      if (s < 0 || e <= s) return texts; // unparseable → originals
      const json = JSON.parse(raw.slice(s, e + 1));
      const out = [...texts];
      for (const row of json?.t || []) {
        const i = Number(row?.i);
        if (Number.isInteger(i) && i >= 0 && i < out.length && typeof row?.en === "string" && row.en.trim()) {
          out[i] = row.en.trim();
        }
      }
      return out;
    } catch (err: any) {
      if (isModelAccessError(String(err?.message || ""))) continue; // try the next model
      return texts; // transient/other → fail open to the original language
    }
  }
  return texts;
}

/** Translate a feed's item titles + summaries to English in one batched call. */
export async function translateFeedItems(items: FeedItem[]): Promise<FeedItem[]> {
  if (!translationAvailable() || !items.length) return items;
  const texts: string[] = [];
  const map: { i: number; field: "title" | "summary" }[] = [];
  items.forEach((it, i) => {
    if (it.title) { texts.push(it.title); map.push({ i, field: "title" }); }
    if (it.summary) { texts.push(it.summary); map.push({ i, field: "summary" }); }
  });
  if (!texts.length) return items;
  const translated = await translateToEnglish(texts);
  const out = items.map((it) => ({ ...it }));
  translated.forEach((t, k) => { const m = map[k]; if (m) out[m.i][m.field] = t; });
  return out;
}
