// Cross-language mirroring (LLM). Asks whether ONE core claim is mirrored/translated
// across languages (a classic influence-op tell) versus independent conversations
// that merely happen to be multilingual. Server-side only, JSON-only prompt with
// defensive parse + one retry. Degrades to a visible "not connected" state when
// there is no ANTHROPIC_API_KEY — never faked. Output is CORRELATION, never proof
// of state involvement, and never attributes to a named private individual.

import Anthropic from "@anthropic-ai/sdk";
import type { Mention, MirroringResult } from "./types";

const UNAVAILABLE = (reason: string, languages: string[] = []): MirroringResult => ({
  available: false, mirrored: false, languages, reason,
});

function safeParse(raw: string): any | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { return null; } }
    return null;
  }
}

export async function detectMirroring(entity: string, mentions: Mention[]): Promise<MirroringResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return UNAVAILABLE("AI cross-language layer not connected (no ANTHROPIC_API_KEY).");

  const langs = [...new Set(mentions.map((m) => (m.lang || "").slice(0, 3)).filter(Boolean))];
  if (langs.length < 2) return UNAVAILABLE("Fewer than two languages present — no cross-language mirroring to assess.", langs);

  // Sample a few mentions per language so the model sees the spread.
  const byLang = new Map<string, Mention[]>();
  for (const m of mentions) {
    const l = (m.lang || "").slice(0, 3);
    if (!l) continue;
    const arr = byLang.get(l) || [];
    if (arr.length < 4) arr.push(m);
    byLang.set(l, arr);
  }
  const sample = [...byLang.entries()]
    .flatMap(([l, ms]) => ms.map((m) => `[${l}] ${m.text.slice(0, 200)}`))
    .slice(0, 40).join("\n");

  const system =
    "You are a disinformation analyst assessing cross-language narrative mirroring. " +
    "You describe narratives and account behaviour only; you NEVER attribute to a named private individual, " +
    "and you treat cross-language overlap as CORRELATION, never proof of state involvement. " +
    "Return ONLY valid JSON, no prose, no markdown fences.";
  const user = `Entity: "${entity}"

Below are public posts tagged by language. Decide whether the SAME core claim is being mirrored/translated across two or more languages (a coordinated tell), or whether these are independent conversations that merely happen to be multilingual.
Return JSON with EXACTLY this schema:
{"mirrored": true|false,
 "languages": ["the language codes that carry the same claim, if any"],
 "claim": "the single mirrored claim in one short English sentence, or empty",
 "alternative": "a plausible non-malicious explanation (e.g. a global news story translated by ordinary outlets)"}

Posts:
"""
${sample}
"""`;

  async function once(): Promise<MirroringResult | null> {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 500, system,
      messages: [{ role: "user", content: user }],
    });
    const block = msg.content.find((b) => b.type === "text");
    const parsed = safeParse(block && block.type === "text" ? block.text : "");
    if (!parsed) return null;
    return {
      available: true,
      mirrored: !!parsed.mirrored,
      languages: Array.isArray(parsed.languages) ? parsed.languages.map((s: any) => String(s)).slice(0, 12) : [],
      claim: parsed.claim ? String(parsed.claim).slice(0, 240) : undefined,
      alternative: String(parsed.alternative || "A global story translated by ordinary outlets also produces cross-language overlap.").slice(0, 240),
    };
  }

  try {
    return (await once()) || (await once()) || UNAVAILABLE("AI cross-language analysis returned unparseable output.", langs);
  } catch (e: any) {
    const m = String(e?.message || "error");
    if (/credit balance|billing|too low|insufficient/i.test(m)) return UNAVAILABLE("AI cross-language analysis paused — Anthropic account out of credits.", langs);
    if (/401|invalid x-api-key|authentication/i.test(m)) return UNAVAILABLE("AI cross-language analysis unavailable — ANTHROPIC_API_KEY appears invalid.", langs);
    if (/429|rate limit/i.test(m)) return UNAVAILABLE("AI cross-language analysis rate-limited — try again shortly.", langs);
    return UNAVAILABLE(`AI cross-language analysis failed: ${m.slice(0, 140)}.`, langs);
  }
}
