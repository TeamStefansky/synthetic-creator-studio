// Server-side narrative clustering for the SIGNAL console. Groups the REAL
// collected mentions into narrative threads (storylines) by index - the lawful
// replacement for the uploaded dashboard's "invent narratives" prompt:
//   - input is ONLY collected public mention texts (never generated),
//   - output references mentions by index; anything out of range is dropped,
//   - a mention the model failed to place stays unclustered (rule 4 - never
//     force-fit), and the client renders an honest UNCLUSTERED bucket,
//   - no ANTHROPIC_API_KEY -> visible available:false (rule 7), never faked.
// Narratives describe STORYLINES in public conversation - never actors, never
// a claim about who is behind them (rule 1).

import Anthropic from "@anthropic-ai/sdk";
import { LLM_MODEL } from "@/lib/llm";
import type { Mention } from "./narrative/types";

export interface NarrativeThread {
  /** Short storyline label (what is being said - never who is behind it). */
  name: string;
  /** One-line driver note. */
  note: string;
  /** Indices into the mentions array this thread groups. */
  mentions: number[];
}

export interface NarrativesResult {
  available: boolean;
  reason?: string;
  considered: number;
  threads: NarrativeThread[];
}

/** How many mentions we cluster per scan (most-recent-first, same cap ethos as
 * sentiment - the rest stay unclustered and the UI shows them honestly). */
export const NARRATIVES_CAP = 60;
const MAX_THREADS = 6;

const UNAVAILABLE = (reason: string, considered = 0): NarrativesResult => ({
  available: false, reason, considered, threads: [],
});

/** Defensive parse + validation. Keeps only threads with a name and in-range,
 * de-duplicated mention indices; a mention claimed by two threads stays with
 * the first. Empty/invalid rows are dropped, never guessed. */
export function parseNarrativeThreads(raw: string, count: number): NarrativeThread[] {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  let parsed: any = null;
  try { parsed = JSON.parse(cleaned); } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { parsed = null; } }
  }
  const rows: any[] = Array.isArray(parsed?.narratives) ? parsed.narratives
    : Array.isArray(parsed) ? parsed : [];
  const seen = new Set<number>();
  const out: NarrativeThread[] = [];
  for (const r of rows.slice(0, MAX_THREADS)) {
    const name = String(r?.name || "").trim().slice(0, 48);
    if (!name) continue;
    const idxs = (Array.isArray(r?.mentions) ? r.mentions : [])
      .map((n: any) => Number(n))
      .filter((n: number) => Number.isInteger(n) && n >= 0 && n < count && !seen.has(n));
    if (!idxs.length) continue;
    idxs.forEach((n: number) => seen.add(n));
    out.push({ name, note: String(r?.note || "").slice(0, 80), mentions: idxs });
  }
  return out;
}

/** Cluster collected mentions into narrative threads. One batched call, JSON
 * only, defensive parse + one retry (house pattern, see narrative/mirroring). */
export async function clusterNarratives(entity: string, mentions: Mention[]): Promise<NarrativesResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return UNAVAILABLE("Narrative layer not connected (no ANTHROPIC_API_KEY).");

  const batch = mentions.slice(0, NARRATIVES_CAP);
  const withText = batch.map((m, i) => ({ i, t: (m.text || "").replace(/\s+/g, " ").slice(0, 200) }))
    .filter((r) => r.t.trim());
  if (withText.length < 2) return UNAVAILABLE("Not enough mention text to cluster.", batch.length);

  const system =
    "You group public posts/headlines about a brand into narrative threads - storylines of WHAT is being said. " +
    "You describe narratives only: never name or characterize the people behind them, never invent posts that are not in the input, " +
    "and never force-fit - a post that matches no thread is simply left out. " +
    "Return ONLY valid JSON, no prose, no markdown fences.";
  const user = `Brand/term: "${entity}"

Each line is one collected public post: index|text. Group them into 2-${MAX_THREADS} narrative threads.
Return JSON with EXACTLY this schema:
{"narratives":[{"name":"<=5 words, the storyline itself","note":"<=12 words, what drives it","mentions":[indices]}]}
Only use indices that appear below. Leave a post out rather than force-fitting it.

Posts:
"""
${withText.map((r) => `${r.i}|${r.t}`).join("\n")}
"""`;

  async function once(): Promise<NarrativeThread[] | null> {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model: LLM_MODEL, max_tokens: 1500, system,
      messages: [{ role: "user", content: user }],
    });
    const block = msg.content.find((b) => b.type === "text");
    const threads = parseNarrativeThreads(block && block.type === "text" ? block.text : "", batch.length);
    return threads.length ? threads : null;
  }

  try {
    const threads = (await once()) || (await once());
    if (!threads) return UNAVAILABLE("Narrative clustering returned unparseable output.", batch.length);
    return { available: true, considered: batch.length, threads };
  } catch (e: any) {
    const m = String(e?.message || "error");
    if (/credit balance|billing|too low|insufficient/i.test(m)) return UNAVAILABLE("Narratives paused - Anthropic account out of credits.", batch.length);
    if (/401|invalid x-api-key|authentication/i.test(m)) return UNAVAILABLE("Narratives unavailable - ANTHROPIC_API_KEY appears invalid.", batch.length);
    if (/429|rate limit/i.test(m)) return UNAVAILABLE("Narratives rate-limited - try again shortly.", batch.length);
    return UNAVAILABLE(`Narrative clustering failed: ${m.slice(0, 140)}.`, batch.length);
  }
}
