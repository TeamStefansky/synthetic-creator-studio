// Content-credibility analysis via the Anthropic API (server-side only).
// Returns a structured JSON assessment of the article text. If the API key is
// missing or the call fails, returns an "unavailable" result without crashing.

import Anthropic from "@anthropic-ai/sdk";
import type { ContentAnalysis } from "./types";

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT =
  "You are a media-literacy analyst. Analyze the supplied article text for " +
  "credibility signals. Return ONLY valid JSON, no prose, no markdown fences.";

const UNAVAILABLE: ContentAnalysis = {
  available: false,
  sensationalism: null,
  emotionalManipulation: null,
  sourcingQuality: null,
  aiGeneratedLikelihood: null,
  summary: null,
  redFlags: [],
};

function clampScore(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Strip accidental ```json fences and parse safely. */
function parseJson(raw: string): Record<string, unknown> | null {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  // Grab the first {...} block in case the model added stray characters.
  const match = text.match(/\{[\s\S]*\}/);
  if (match) text = match[0];
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function analyzeContent(
  articleText: string
): Promise<ContentAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !articleText || articleText.trim().length < 80) {
    return UNAVAILABLE;
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content:
            `Analyze this article text. Return ONLY this JSON shape:\n` +
            `{"sensationalism":0-100,"emotionalManipulation":0-100,` +
            `"sourcingQuality":0-100,"aiGeneratedLikelihood":0-100,` +
            `"summary":"1-2 sentences","redFlags":["..."]}\n\n` +
            `ARTICLE TEXT:\n"""${articleText.slice(0, 6000)}"""`,
        },
      ],
    });

    const block = message.content.find((b) => b.type === "text");
    const raw = block && block.type === "text" ? block.text : "";
    const parsed = parseJson(raw);
    if (!parsed) return UNAVAILABLE;

    return {
      available: true,
      sensationalism: clampScore(parsed.sensationalism),
      emotionalManipulation: clampScore(parsed.emotionalManipulation),
      sourcingQuality: clampScore(parsed.sourcingQuality),
      aiGeneratedLikelihood: clampScore(parsed.aiGeneratedLikelihood),
      summary:
        typeof parsed.summary === "string" ? parsed.summary.slice(0, 400) : null,
      redFlags: Array.isArray(parsed.redFlags)
        ? parsed.redFlags
            .filter((x): x is string => typeof x === "string")
            .slice(0, 8)
        : [],
    };
  } catch {
    // Network error, auth error, rate limit, etc. — degrade gracefully.
    return UNAVAILABLE;
  }
}
