// "Is this post fake?" - fact-checks a pasted social post or article text.
// Extracts the check-worthy claims, verifies them against the open web via the
// Anthropic web_search tool, and returns a structured verdict with sources.
// Gated behind ANTHROPIC_API_KEY. Indicators with sources - not a final ruling.

import Anthropic from "@anthropic-ai/sdk";
import { LLM_MODEL } from "./llm";
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
      model: LLM_MODEL,
      max_tokens: 2500,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 } as any],
      system:
        "You are a rigorous fact-checker AND image-forensics analyst. Identify the concrete, check-worthy factual claims and verify them using web_search against reliable sources. Distinguish fact from opinion/satire. Cite real sources. Never fabricate. Be calibrated: use 'Unverified' when evidence is thin. " +
        "When an IMAGE is provided: (1) OCR - transcribe VERBATIM all text visible in the image (jersey name and number, captions, overlays, watermarks, signs); read the exact letters shown, do NOT 'correct' them into a more plausible name. (2) Scrutinize the IMAGE ITSELF as well as the text - a post can be fake because its PHOTO is fake or miscaptioned even when the caption's standalone fact is true. Look for: implausible or impossible details (e.g. an implausible jersey/kit number, a name+number that does not match a real player, wrong logos or text, a person/outfit/setting that does not fit the claimed event), distorted anatomy (hands, teeth, ears), warped or nonsensical text, inconsistent lighting/shadows/reflections, and AI-generation or photo-editing artifacts. (3) If the image clearly depicts a widely-recognizable PUBLIC figure (a celebrity, athlete, politician, or public official) and it is relevant to the assessment, you MAY note who it appears to be, hedged ('appears to be …'). NEVER attempt to identify, name, or de-anonymize a PRIVATE / non-public individual - that is prohibited; describe them only generically ('a person'). This is fact-check context on public figures, not surveillance. Judge whether the image is authentic vs AI-generated/edited, and whether it genuinely SUPPORTS the caption or is out-of-context/miscaptioned. " +
        "The overall verdict must reflect the WHOLE post: if the image is manipulated, AI-generated, or miscaptioned, the post is at least 'Misleading' (or 'Likely False' if the image fabricates the event) EVEN IF the caption's fact is independently true. Output is consumed by software - end with a single JSON object and nothing after it.",
      messages: [
        {
          role: "user",
          content: [
            ...(input.image
              ? [{ type: "image", source: { type: "base64", media_type: input.image.mediaType, data: input.image.data } }]
              : []),
            {
              type: "text",
              text: `Fact-check this ${input.image ? "post shown in the screenshot. First read the text/claims visible in the image (and note who posted it, if shown). THEN forensically examine the IMAGE itself for manipulation, AI-generation, or miscaptioning (see the system instructions) - the photo may be the fake part even if the caption is true" : "post/claim"}. Verify its factual claims against the open web, then output ONE JSON object (no text after it):
{
  "verdict": "Likely False | Misleading | Unverified | Likely True | Opinion or Satire",
  "confidence": "Low | Medium | High",
  "summary": "2-3 sentence plain-language conclusion covering BOTH the claims and (if an image was given) the image's authenticity",
  "claims": [{"claim":"the specific claim","verdict":"supported | contradicted | unverified | misleading","assessment":"what the sources show"}],${input.image ? `
  "imageText": "verbatim OCR of ALL text visible in the image (jersey name+number, captions, overlays, watermarks); empty string if none",
  "imageAssessment": "1-3 sentences: is the image authentic, AI-generated, or edited? if a widely-recognizable PUBLIC figure is shown and relevant, note who it appears to be (hedged) - but never a private individual. does it actually support the caption or is it miscaptioned/out-of-context? name the specific visual signs (e.g. implausible jersey name/number, distorted hands, warped text, lighting mismatch).",` : ""}
  "manipulationTechniques": ["e.g. miscaptioned/out-of-context image, AI-generated image, doctored photo, missing context, doctored quote, false attribution"],
  "aiGeneratedLikelihood": 0-100 (${input.image ? "your estimate the IMAGE is AI-generated or digitally manipulated, from the visual artifacts you see" : "0 when there is no image"}),
  "redFlags": ["specific warning signs${input.image ? " in the text AND the image" : " in the text"}"],
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
      imageAssessment: input.image && parsed.imageAssessment ? String(parsed.imageAssessment).slice(0, 800) : undefined,
      imageText: input.image && parsed.imageText ? String(parsed.imageText).slice(0, 600) : undefined,
      note: "Fact-check with sources - indicators, not a final legal ruling. Verify the sources yourself.",
    };
  } catch (e: any) {
    const m = String(e?.message || "error");
    // The UI shows `summary || note`, so each failure must set an ACCURATE summary -     // the key IS configured here, so never fall back to the "needs ANTHROPIC_API_KEY"
    // text (that would misreport an out-of-credits/rate-limit as a missing key).
    if (/credit balance|billing|too low|insufficient/i.test(m))
      return { ...UNAVAILABLE, summary: "AI fact-checking is temporarily paused - the Anthropic account is out of credits.", note: "Add credits at console.anthropic.com → Plans & Billing, then try again." };
    if (/401|invalid x-api-key|authentication/i.test(m))
      return { ...UNAVAILABLE, summary: "AI fact-checking is unavailable - the Anthropic API key appears to be invalid.", note: "Check the ANTHROPIC_API_KEY value in the server environment." };
    if (/429|rate limit/i.test(m))
      return { ...UNAVAILABLE, summary: "AI fact-checking is rate-limited - please try again shortly.", note: "Too many requests in a short window." };
    return { ...UNAVAILABLE, summary: "AI fact-checking couldn’t complete for this post.", note: `Details: ${m.slice(0, 160)}` };
  }
}
