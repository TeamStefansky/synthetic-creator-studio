// LLM narrative clustering + claim extraction for Brand Watch. Server-side only,
// JSON-only prompt with defensive parse + one retry. Degrades to a visible
// "AI layer not connected" state when no ANTHROPIC_API_KEY — never faked.
// Output is interpretive: each cluster carries an explicit alternative reading.

import Anthropic from "@anthropic-ai/sdk";
import { LLM_MODEL } from "@/lib/llm";
import type { Mention, NarrativeCluster, NarrativeExtraction } from "./types";

const UNAVAILABLE = (reason: string): NarrativeExtraction => ({
  available: false, coreClaims: [], clusters: [], assessment: "", reason,
});

function safeParse(raw: string): any | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { return null; } }
    return null;
  }
}

const HOST = new Set(["low", "medium", "high"]);

export async function extractNarratives(entity: string, mentions: Mention[]): Promise<NarrativeExtraction> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return UNAVAILABLE("AI narrative analysis not connected (no ANTHROPIC_API_KEY).");
  if (mentions.length < 3) return UNAVAILABLE("Not enough mentions for narrative clustering.");

  const sample = mentions.slice(0, 60).map((m, i) => `${i + 1}. [${m.source}] ${m.text.slice(0, 200)}`).join("\n");
  const system =
    "You are a disinformation analyst. You identify NARRATIVES and CLAIMS in public posts about an entity. " +
    "You never attribute to named private individuals; you describe narratives and account behaviour only. " +
    "You surface indicators, never verdicts. Return ONLY valid JSON, no prose, no markdown fences.";
  const user = `Entity being monitored: "${entity}"

Below are public mentions. Identify the distinct NARRATIVES/CLAIMS circulating about the entity, and cluster them.
Return JSON with EXACTLY this schema (no prose, no fences):
{"coreClaims":["the main claim(s) being pushed, short"],
 "clusters":[{"label":"short cluster name","summary":"1 sentence","hostility":"low|medium|high","alternative":"a plausible non-malicious explanation for this cluster"}],
 "assessment":"1-2 sentence neutral read of whether this looks like an organic conversation or a pushed/coordinated narrative — hedged, indicators not verdict"}

Mentions:
"""
${sample}
"""`;

  async function once(): Promise<NarrativeExtraction | null> {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model: LLM_MODEL, max_tokens: 1200, system,
      messages: [{ role: "user", content: user }],
    });
    const block = msg.content.find((b) => b.type === "text");
    const parsed = safeParse(block && block.type === "text" ? block.text : "");
    if (!parsed) return null;
    return {
      available: true,
      coreClaims: Array.isArray(parsed.coreClaims) ? parsed.coreClaims.map((s: any) => String(s)).slice(0, 8) : [],
      clusters: Array.isArray(parsed.clusters) ? parsed.clusters.slice(0, 8).map((c: any): NarrativeCluster => ({
        label: String(c.label || "").slice(0, 80),
        summary: String(c.summary || "").slice(0, 240),
        hostility: HOST.has(c.hostility) ? c.hostility : "low",
        alternative: String(c.alternative || "Could reflect genuine, independent public concern.").slice(0, 240),
      })) : [],
      assessment: String(parsed.assessment || "").slice(0, 400),
    };
  }

  try {
    return (await once()) || (await once()) || UNAVAILABLE("AI narrative analysis returned unparseable output.");
  } catch (e: any) {
    const m = String(e?.message || "error");
    if (/credit balance|billing|too low|insufficient/i.test(m)) return UNAVAILABLE("AI narrative analysis paused — Anthropic account out of credits.");
    if (/401|invalid x-api-key|authentication/i.test(m)) return UNAVAILABLE("AI narrative analysis unavailable — ANTHROPIC_API_KEY appears invalid.");
    if (/429|rate limit/i.test(m)) return UNAVAILABLE("AI narrative analysis rate-limited — try again shortly.");
    return UNAVAILABLE(`AI narrative analysis failed: ${m.slice(0, 140)}.`);
  }
}
