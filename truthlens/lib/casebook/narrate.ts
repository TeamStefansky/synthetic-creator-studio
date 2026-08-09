// Optional LLM polish for the case report's bottom-line (BLUF). The dossier
// builder already produces a correct, deterministic BLUF; this only rewrites it
// into cleaner prose. Without ANTHROPIC_API_KEY it returns the deterministic
// text unchanged (rule 7: never fake capability — the report is fully usable
// with no key). The model may NOT change the conclusion, add a person, or
// exceed the recorded conclusion level — it is handed the finished facts and
// asked only to phrase them.

import Anthropic from "@anthropic-ai/sdk";
import { LLM_MODEL } from "@/lib/llm";
import type { CaseDossier } from "./dossier";

export interface NarrationResult {
  bluf: string;
  source: "llm" | "deterministic";
  reason?: string;
}

export async function narrateReport(d: CaseDossier): Promise<NarrationResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { bluf: d.bluf, source: "deterministic", reason: "No ANTHROPIC_API_KEY — using the deterministic bottom line." };

  const facts = {
    searches: d.searchCount,
    conclusionLevel: d.conclusionLevel,
    conclusionConfidence: d.conclusionConfidence,
    strongestLink: d.evidence[0]
      ? { label: d.evidence[0].label, value: d.evidence[0].value, confidence: d.evidence[0].confidence, alternative: d.evidence[0].alternative, inSearches: d.evidence[0].searches.length }
      : null,
    subjects: d.subjects.map((s) => ({ domain: s.domain, risk: s.risk, confidence: s.confidence })),
    infrastructureCount: d.infrastructure.length,
  };

  const system =
    "You write the bottom-line-up-front (BLUF) paragraph of a defensive-OSINT report. You are given FINISHED, " +
    "verified facts and must only phrase them clearly. HARD RULES: never state a conclusion stronger than the given " +
    "conclusionLevel; never name or characterize any person; infrastructure association is NEVER shared ownership; " +
    "always include the alternative explanation for the strongest link. 2–4 sentences, plain English. Return the paragraph only.";
  const user = `Facts (do not exceed them):\n${JSON.stringify(facts, null, 2)}\n\nWrite the BLUF paragraph.`;

  try {
    const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 25_000 });
    const msg = await client.messages.create({
      model: LLM_MODEL, max_tokens: 400, system,
      messages: [{ role: "user", content: user }],
    });
    const block = msg.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text.trim() : "";
    if (!text) return { bluf: d.bluf, source: "deterministic", reason: "Empty model output — using the deterministic bottom line." };
    return { bluf: text, source: "llm" };
  } catch (e: any) {
    return { bluf: d.bluf, source: "deterministic", reason: `Model unavailable (${String(e?.message || "error").slice(0, 80)}) — using the deterministic bottom line.` };
  }
}
