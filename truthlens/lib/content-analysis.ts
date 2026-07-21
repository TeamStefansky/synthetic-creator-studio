// Content credibility analysis via Anthropic (Claude). Server-side only.
// Degrades gracefully to "unavailable" when no key is configured.

import Anthropic from "@anthropic-ai/sdk";
import { LLM_MODEL } from "./llm";
import type { ContentAnalysis } from "./types";

const UNAVAILABLE: ContentAnalysis = {
  available: false,
  sensationalism: 0,
  emotionalManipulation: 0,
  sourcingQuality: 0,
  aiGeneratedLikelihood: 0,
  summary: "Content analysis unavailable (no ANTHROPIC_API_KEY configured).",
  redFlags: [],
  narratives: [],
  propagandaTechniques: [],
  manipulationTactics: [],
  targetAudience: "",
  intent: "",
};

function clamp(n: any): number {
  const v = Number(n);
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Strip accidental ```json fences and parse. */
function safeParse(raw: string): any | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function analyzeContent(text: string): Promise<ContentAnalysis> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return UNAVAILABLE;
  if (!text || text.trim().length < 80) {
    return { ...UNAVAILABLE, summary: "Not enough article text to analyze." };
  }

  try {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 1024,
      system:
        "You are a media-literacy analyst. Analyze the supplied article text for credibility signals. Return ONLY valid JSON, no prose, no markdown fences.",
      messages: [
        {
          role: "user",
          content: `Analyze this article for credibility AND for narrative/influence intelligence. Return JSON with EXACTLY this schema (no prose, no fences):
{"sensationalism":0-100,"emotionalManipulation":0-100,"sourcingQuality":0-100,"aiGeneratedLikelihood":0-100,"summary":"1-2 sentences","redFlags":["..."],"narratives":["the main narrative(s)/claim(s) being pushed"],"propagandaTechniques":["named techniques, e.g. fear appeal, strawman, false dichotomy, whataboutism, cherry-picking"],"manipulationTactics":["concrete manipulative moves used in THIS text"],"targetAudience":"who this is aimed at","intent":"one of: informational | persuasive | propaganda | clickbait | satire | advertising"}

Article text:
"""
${text.slice(0, 6000)}
"""`,
        },
      ],
    });

    const block = msg.content.find((b) => b.type === "text");
    const raw = block && block.type === "text" ? block.text : "";
    const parsed = safeParse(raw);
    if (!parsed) return { ...UNAVAILABLE, summary: "Content analysis returned unparseable output." };

    return {
      available: true,
      sensationalism: clamp(parsed.sensationalism),
      emotionalManipulation: clamp(parsed.emotionalManipulation),
      sourcingQuality: clamp(parsed.sourcingQuality),
      aiGeneratedLikelihood: clamp(parsed.aiGeneratedLikelihood),
      summary: String(parsed.summary || "").slice(0, 400),
      redFlags: Array.isArray(parsed.redFlags)
        ? parsed.redFlags.map((r: any) => String(r)).slice(0, 10)
        : [],
      narratives: Array.isArray(parsed.narratives) ? parsed.narratives.map((r: any) => String(r)).slice(0, 8) : [],
      propagandaTechniques: Array.isArray(parsed.propagandaTechniques) ? parsed.propagandaTechniques.map((r: any) => String(r)).slice(0, 10) : [],
      manipulationTactics: Array.isArray(parsed.manipulationTactics) ? parsed.manipulationTactics.map((r: any) => String(r)).slice(0, 10) : [],
      targetAudience: String(parsed.targetAudience || "").slice(0, 200),
      intent: String(parsed.intent || "").slice(0, 60),
    };
  } catch (e: any) {
    const msg = String(e?.message || "error");
    if (/credit balance|billing|too low|insufficient/i.test(msg)) {
      return { ...UNAVAILABLE, summary: "Content analysis paused — the Anthropic account is out of credits. Add credits at console.anthropic.com (Plans & Billing) to re-enable. Everything else in this report still works." };
    }
    if (/401|invalid x-api-key|authentication/i.test(msg)) {
      return { ...UNAVAILABLE, summary: "Content analysis unavailable — the ANTHROPIC_API_KEY appears invalid." };
    }
    if (/429|rate limit/i.test(msg)) {
      return { ...UNAVAILABLE, summary: "Content analysis temporarily rate-limited — try again shortly." };
    }
    return { ...UNAVAILABLE, summary: `Content analysis failed: ${msg.slice(0, 160)}.` };
  }
}
