// Server-side narrative clustering for the SIGNAL console.
//
// v2 (deterministic core): the GROUPING is now computed in pure TypeScript -
// TF-IDF + cosine agglomerative clustering (lib/narrative/textcluster) - so the
// same collected mentions ALWAYS produce the same clusters (rule 8), with no
// model and no key in the loop. The LLM's only job is to NAME a cluster that
// already exists; without ANTHROPIC_API_KEY the clusters still render with
// honest keyword labels (real computation, clearly mechanical - never faked).
//
//   - input is ONLY collected public mention texts (never generated),
//   - clusters reference mentions by index; the model cannot move, add, or
//     invent a member - it only proposes a name for a fixed index set,
//   - a mention matching no cluster stays unclustered (rule 4 - never
//     force-fit), and the client renders an honest UNCLUSTERED bucket.
// Narratives describe STORYLINES in public conversation - never actors, never
// a claim about who is behind them (rule 1).

import Anthropic from "@anthropic-ai/sdk";
import { LLM_MODEL } from "@/lib/llm";
import type { Mention } from "./narrative/types";
import { clusterTexts, topTerms, TEXTCLUSTER_VERSION } from "./narrative/textcluster";

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
  /** How the labels were produced - "llm" (named by the model) or "keywords"
   * (mechanical top-TF-IDF terms; shown when no key / label call failed). */
  labelMode?: "llm" | "keywords";
  /** Clustering engine version (the grouping is deterministic either way). */
  method?: string;
}

/** How many mentions we cluster per scan (most-recent-first, same cap ethos as
 * sentiment - the rest stay unclustered and the UI shows them honestly). */
export const NARRATIVES_CAP = 60;
const MAX_THREADS = 6;

const UNAVAILABLE = (reason: string, considered = 0): NarrativesResult => ({
  available: false, reason, considered, threads: [],
});

/** Defensive parse + validation for the LEGACY grouping schema (kept for
 * back-compat consumers/tests). Keeps only threads with a name and in-range,
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

/** Defensive parse for the LABELING call: {"labels":[{"cluster":i,"name","note"}]}.
 * Only in-range cluster indices are kept; a cluster the model skipped keeps its
 * keyword label (never guessed). */
export function parseClusterLabels(raw: string, count: number): Map<number, { name: string; note: string }> {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  let parsed: any = null;
  try { parsed = JSON.parse(cleaned); } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { parsed = null; } }
  }
  const rows: any[] = Array.isArray(parsed?.labels) ? parsed.labels : Array.isArray(parsed) ? parsed : [];
  const out = new Map<number, { name: string; note: string }>();
  for (const r of rows) {
    const i = Number(r?.cluster);
    const name = String(r?.name || "").trim().slice(0, 48);
    if (!Number.isInteger(i) || i < 0 || i >= count || !name || out.has(i)) continue;
    out.set(i, { name, note: String(r?.note || "").slice(0, 80) });
  }
  return out;
}

/** Mechanical keyword label for a cluster (used without a key, and as the
 * fallback when the label call fails). */
function keywordLabel(texts: string[], members: number[]): { name: string; note: string } {
  const terms = topTerms(texts, members, 3);
  return {
    name: terms.join(" · ").slice(0, 48) || "recurring storyline",
    note: "keyword label (deterministic cluster)",
  };
}

/** Cluster collected mentions into narrative threads. The grouping is pure and
 * deterministic; one optional batched LLM call names the clusters (JSON only,
 * defensive parse, one retry - house pattern). */
export async function clusterNarratives(entity: string, mentions: Mention[]): Promise<NarrativesResult> {
  const batch = mentions.slice(0, NARRATIVES_CAP);
  const rows = batch
    .map((m, i) => ({ i, t: (m.text || "").replace(/\s+/g, " ").slice(0, 200) }))
    .filter((r) => r.t.trim());
  if (rows.length < 2) return UNAVAILABLE("Not enough mention text to cluster.", batch.length);

  // ---- Deterministic grouping (no model, no key) --------------------------
  const texts = rows.map((r) => r.t);
  const clusters = clusterTexts(texts).slice(0, MAX_THREADS);
  if (!clusters.length) {
    return {
      ...UNAVAILABLE("No recurring storyline structure in the collected mentions.", batch.length),
      method: TEXTCLUSTER_VERSION,
    };
  }
  // Map row positions back to original mention indices.
  const threads: NarrativeThread[] = clusters.map((members) => {
    const lbl = keywordLabel(texts, members);
    return { name: lbl.name, note: lbl.note, mentions: members.map((m) => rows[m].i) };
  });

  const base: NarrativesResult = {
    available: true,
    considered: batch.length,
    threads,
    labelMode: "keywords",
    method: TEXTCLUSTER_VERSION,
  };

  // ---- Optional LLM labeling of the FIXED clusters ------------------------
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { ...base, reason: "Labels are keyword-derived (no ANTHROPIC_API_KEY); the clustering itself is deterministic." };
  }

  const system =
    "You NAME clusters of public posts/headlines about a brand/topic. Each cluster already exists - you only " +
    "describe the storyline of WHAT its posts are saying, in a few words. Frame labels as discourse " +
    "(what posts claim/discuss), never as your own assertion of fact, never naming or characterizing the people " +
    "behind them. Return ONLY valid JSON, no prose, no markdown fences.";
  const user = `Topic/term: "${entity}"

Below are ${clusters.length} clusters of collected public posts. For EACH cluster return a short storyline label.
Return JSON with EXACTLY this schema:
{"labels":[{"cluster":<index>,"name":"<=5 words, the storyline","note":"<=12 words, what drives it"}]}

${clusters
  .map((members, ci) => {
    const sample = members.slice(0, 6).map((m) => `- ${texts[m]}`).join("\n");
    return `Cluster ${ci} (${members.length} posts):\n${sample}`;
  })
  .join("\n\n")}`;

  async function once(): Promise<Map<number, { name: string; note: string }> | null> {
    // Fail fast (no retries + hard timeout) so a slow model degrades to
    // keyword labels rather than hanging the serverless function.
    const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 28_000 });
    const msg = await client.messages.create({
      model: LLM_MODEL, max_tokens: 800, system,
      messages: [{ role: "user", content: user }],
    });
    const block = msg.content.find((b) => b.type === "text");
    const labels = parseClusterLabels(block && block.type === "text" ? block.text : "", clusters.length);
    return labels.size ? labels : null;
  }

  try {
    const labels = (await once()) || (await once());
    if (!labels) return { ...base, reason: "Label call returned unparseable output - showing keyword labels." };
    const named = threads.map((t, i) => {
      const l = labels.get(i);
      return l ? { ...t, name: l.name, note: l.note } : t;
    });
    return { ...base, threads: named, labelMode: "llm", reason: undefined };
  } catch (e: any) {
    const m = String(e?.message || "error");
    let reason = `Label call failed (${m.slice(0, 90)}) - showing keyword labels.`;
    if (/credit balance|billing|too low|insufficient/i.test(m)) reason = "Label call paused (out of credits) - showing keyword labels.";
    if (/401|invalid x-api-key|authentication/i.test(m)) reason = "ANTHROPIC_API_KEY appears invalid - showing keyword labels.";
    if (/429|rate limit/i.test(m)) reason = "Label call rate-limited - showing keyword labels.";
    return { ...base, reason };
  }
}
