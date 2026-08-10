// Optional LLM narrative synthesis for the OSINT report. Given the COLLECTED
// facts, the model writes prose ONLY for the narrative sections (executive
// summary, actor narrative, narrative analysis, next steps). It never sets the
// confidence, the attribution, or any table/score - those are computed in code
// and passed in as fixed facts. Without ANTHROPIC_API_KEY it returns {} and the
// deterministic defaults stand (rule 7 - never fake capability).
//
// Hard rules in the prompt: organization/campaign-level only, never a person;
// never exceed the given confidence; always keep the innocent alternative.

import Anthropic from "@anthropic-ai/sdk";
import { LLM_MODEL } from "@/lib/llm";
import type { ReportInput } from "./report";
import type { ResearchFindings } from "./research";

export type NarrativeFields = Partial<Pick<ReportInput,
  "executive_summary" | "actor_narrative" | "narrative_analysis" | "next_steps">>;

export async function narrateResearch(f: ResearchFindings, confidence: string): Promise<NarrativeFields> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return {};

  const facts = {
    query: f.value, kind: f.kind,
    watchlistCluster: f.watchlist?.cluster || null,
    attribution: f.watchlist?.attribution || "Undetermined",
    reporting: f.watchlist?.reporting || [],
    ctHosts: f.crtsh?.members?.length || 0,
    trackers: { ga: f.trackers.gaIds, adsense: f.trackers.adsenseIds },
    reverseLookupMembers: f.pivots.reduce((s, p) => s + p.members.length, 0),
    hostConduct: f.hostConduct?.matched ? { org: f.hostConduct.org, findings: f.hostConduct.findings.map((x) => x.label) } : null,
    toolsNotConnected: f.toolsNotConfigured,
    derivedConfidence: confidence,
  };

  const system =
    "You write the narrative prose sections of a defensive-OSINT report from FINISHED, collected facts. " +
    "HARD RULES: attribution is organization/campaign-level ONLY - never name or characterize a private individual; " +
    "never state a confidence higher than derivedConfidence; infrastructure association is NEVER shared ownership; " +
    "always keep an innocent alternative; if a fact is absent, say it is not assessed rather than inventing it. " +
    "Return ONLY valid JSON with keys executive_summary, actor_narrative, narrative_analysis, next_steps - each a short paragraph.";
  const user = `Facts (do not exceed them):\n${JSON.stringify(facts, null, 2)}`;

  try {
    const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 25_000 });
    const msg = await client.messages.create({ model: LLM_MODEL, max_tokens: 900, system, messages: [{ role: "user", content: user }] });
    const block = msg.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1));
    const pick = (k: string) => (typeof parsed?.[k] === "string" && parsed[k].trim() ? String(parsed[k]).slice(0, 4000) : undefined);
    return {
      executive_summary: pick("executive_summary"),
      actor_narrative: pick("actor_narrative"),
      narrative_analysis: pick("narrative_analysis"),
      next_steps: pick("next_steps"),
    };
  } catch {
    return {}; // any failure → deterministic defaults stand
  }
}
