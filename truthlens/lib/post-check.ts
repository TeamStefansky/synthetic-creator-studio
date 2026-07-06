// "Is this post fake?" — fact-checks a pasted social post or article text.
// Extracts the check-worthy claims, verifies them against the open web via the
// Anthropic web_search tool, and returns a structured verdict with sources.
// Gated behind ANTHROPIC_API_KEY. Indicators with sources — not a final ruling.

import Anthropic from "@anthropic-ai/sdk";
import type { PostCheckResult, PostVerdict, Confidence } from "./types";

const VERDICTS: PostVerdict[] = ["Likely False", "Misleading", "Unverified", "Likely True", "Opinion or Satire"];

function normVerdict(v: any): PostVerdict {
  const s = String(v || "").toLowerCase();
  if (s.includes("false")) return "Likely False";
  if (s.includes("mislead")) return "Misleading";
  if (s.includes("true")) return "Likely True";
  if (s.includes("opinion") || s.includes("satire")) return "Opinion or Satire";
  return "Unverified";
}
function normConf(v: any): Confidence {
  const s = String(v || "").toLowerCase();
  if (s.startsWith("h")) return "High";
  if (s.startsWith("m")) return "Medium";
  return "Low";
}
function arr(v: any): any[] {
  return Array.isArray(v) ? v : [];
}
function extractJson(raw: string): any | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const m = candidate.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

const UNAVAILABLE: PostCheckResult = {
  available: false,
  verdict: "Unverified",
  confidence: "Low",
  summary: "Post checking needs ANTHROPIC_API_KEY (Claude + web_search) configured on the server.",
  claims: [],
  manipulationTechniques: [],
  aiGeneratedLikelihood: 0,
  redFlags: [],
  sources: [],
  note: "Set ANTHROPIC_API_KEY to enable claim verification against the open web.",
};

export interface PostInput {
  text?: string;
  image?: { data: string; mediaType: string }; // base64 screenshot of a post
}

export async function checkPost(input: PostInput): Promise<PostCheckResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return UNAVAILABLE;
  const text = (input.text || "").trim();
  if (!input.image && text.length < 10) {
    return { ...UNAVAILABLE, available: true, summary: "Paste a longer post or claim to check." };
  }

  try {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 } as any],
      system:
        "You are a rigorous fact-checker. Identify the concrete, check-worthy factual claims in the text, verify them using web_search against reliable sources, and judge them. Distinguish fact from opinion/satire. Cite real sources. Never fabricate. Be calibrated: use 'Unverified' when evidence is thin. Output is consumed by software — end with a single JSON object and nothing after it.",
      messages: [
        {
          role: "user",
          content: [
            ...(input.image
              ? [{ type: "image", source: { type: "base64", media_type: input.image.mediaType, data: input.image.data } }]
              : []),
            {
              type: "text",
              text: `Fact-check this ${input.image ? "post shown in the screenshot — first read the text and claims visible in the image (and note who posted it, if shown)" : "post/claim"}. Verify its factual claims against the open web, then output ONE JSON object (no text after it):
{
  "verdict": "Likely False | Misleading | Unverified | Likely True | Opinion or Satire",
  "confidence": "Low | Medium | High",
  "summary": "2-3 sentence plain-language conclusion",
  "claims": [{"claim":"the specific claim","verdict":"supported | contradicted | unverified | misleading","assessment":"what the sources show"}],
  "manipulationTechniques": ["e.g. missing context, doctored quote, fear appeal, false attribution"],
  "aiGeneratedLikelihood": 0-100,
  "redFlags": ["specific warning signs in the text"],
  "sources": [{"title":"","url":""}]
}${text ? `\n\nPOST/CLAIM:\n"""\n${text.slice(0, 6000)}\n"""` : ""}`,
            },
          ] as any,
        },
      ],
    });

    const textBlock = [...msg.content].reverse().find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const parsed = extractJson(raw);
    if (!parsed) {
      return { ...UNAVAILABLE, available: true, summary: raw.slice(0, 500) || "No structured verdict returned.", note: "Analysis ran but returned unstructured output." };
    }

    return {
      available: true,
      verdict: normVerdict(parsed.verdict),
      confidence: normConf(parsed.confidence),
      summary: String(parsed.summary || "").slice(0, 800),
      claims: arr(parsed.claims)
        .map((c: any) => ({ claim: String(c?.claim || ""), verdict: String(c?.verdict || ""), assessment: String(c?.assessment || "") }))
        .filter((c) => c.claim)
        .slice(0, 12),
      manipulationTechniques: arr(parsed.manipulationTechniques).map((t) => String(t)).filter(Boolean).slice(0, 12),
      aiGeneratedLikelihood: Math.max(0, Math.min(100, Math.round(Number(parsed.aiGeneratedLikelihood) || 0))),
      redFlags: arr(parsed.redFlags).map((t) => String(t)).filter(Boolean).slice(0, 12),
      sources: arr(parsed.sources)
        .map((s: any) => ({ title: String(s?.title || s?.url || ""), url: String(s?.url || "") }))
        .filter((s) => s.url)
        .slice(0, 20),
      note: "Fact-check with sources — indicators, not a final legal ruling. Verify the sources yourself.",
    };
  } catch (e: any) {
    const m = String(e?.message || "error");
    if (/credit balance|billing|too low|insufficient/i.test(m)) return { ...UNAVAILABLE, note: "Paused — the Anthropic account is out of credits (console.anthropic.com → Plans & Billing)." };
    if (/429|rate limit/i.test(m)) return { ...UNAVAILABLE, note: "Rate-limited — try again shortly." };
    return { ...UNAVAILABLE, note: `Post check failed: ${m.slice(0, 160)}.` };
  }
}
