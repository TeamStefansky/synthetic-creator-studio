// Server-side sentiment for the SIGNAL console. Classifies the sentiment of
// REAL collected mentions toward the target brand - per mention, with a
// confidence - and summarizes only what was actually labeled. This is the
// lawful replacement for the uploaded dashboard's invented "overallSentiment":
//   - input is only collected public mentions (never generated text),
//   - the overall score is COMPUTED from per-mention labels, never asked for,
//   - unlabeled mentions stay unlabeled ("not collected", rule 4),
//   - no ANTHROPIC_API_KEY -> visible "not connected" (rule 7), never faked.
// Server-side only; the API key never reaches the client.

import Anthropic from "@anthropic-ai/sdk";
import { LLM_MODEL } from "@/lib/llm";
import type { Mention } from "./narrative/types";

export type SentimentLabel = "pos" | "neg" | "neu";

export interface MentionSentiment {
  id: string;
  label: SentimentLabel;
  confidence: number; // 0-1
}

export interface SentimentSummary {
  available: boolean;
  reason?: string;
  /** How many mentions were sent for labeling (capped) vs. actually labeled. */
  considered: number;
  labeled: number;
  pos: number;
  neg: number;
  neu: number;
  /** -100..100 computed as (pos - neg) / labeled * 100; null when nothing labeled. */
  score: number | null;
  /** Honest caveat rendered next to the gauge (rule 3's "could also be…"). */
  alternative: string;
}

export interface SentimentResult extends SentimentSummary {
  labels: MentionSentiment[];
}

/** How many mentions we classify per scan (most-recent-first; the rest stay
 * honestly unlabeled and the UI shows the coverage). */
export const SENTIMENT_CAP = 60;

const ALTERNATIVE =
  "Automated per-mention labels; tone can also reflect topic mix, sarcasm, or news-heavy sourcing rather than true brand perception.";

const UNAVAILABLE = (reason: string, considered = 0): SentimentResult => ({
  available: false, reason, considered, labeled: 0, pos: 0, neg: 0, neu: 0,
  score: null, alternative: ALTERNATIVE, labels: [],
});

/** Pure summary over per-mention labels. Score is computed, never model-given. */
export function summarizeSentiment(labels: MentionSentiment[], considered: number): SentimentSummary {
  let pos = 0, neg = 0, neu = 0;
  for (const l of labels) {
    if (l.label === "pos") pos++;
    else if (l.label === "neg") neg++;
    else neu++;
  }
  const labeled = labels.length;
  const score = labeled === 0 ? null : Math.round(((pos - neg) / labeled) * 100);
  return { available: true, considered, labeled, pos, neg, neu, score, alternative: ALTERNATIVE };
}

/** Defensive parse of the model's JSON. Keeps only labels whose id matches a
 * mention we actually sent, with a valid label; clamps confidence to [0,1].
 * Anything else is dropped - a bad row never becomes a fabricated label. */
export function parseSentimentLabels(raw: string, validIds: Set<string>): MentionSentiment[] {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  let parsed: any = null;
  try { parsed = JSON.parse(cleaned); } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { parsed = null; } }
  }
  const rows: any[] = Array.isArray(parsed?.labels) ? parsed.labels : Array.isArray(parsed) ? parsed : [];
  const out: MentionSentiment[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const id = String(r?.id ?? "");
    const label = r?.s ?? r?.label ?? r?.sentiment;
    if (!id || !validIds.has(id) || seen.has(id)) continue;
    if (label !== "pos" && label !== "neg" && label !== "neu") continue;
    const c = Number(r?.c ?? r?.confidence);
    out.push({ id, label, confidence: isFinite(c) ? Math.min(1, Math.max(0, c)) : 0.5 });
    seen.add(id);
  }
  return out;
}

/** Classify collected mentions' sentiment toward the entity. Batched (one call
 * per scan, capped), JSON-only prompt, defensive parse + one retry - the same
 * house pattern as lib/narrative/mirroring.ts. */
export async function classifySentiment(entity: string, mentions: Mention[]): Promise<SentimentResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return UNAVAILABLE("Sentiment layer not connected (no ANTHROPIC_API_KEY).");

  const batch = mentions.filter((m) => (m.text || "").trim()).slice(0, SENTIMENT_CAP);
  if (batch.length === 0) return UNAVAILABLE("No mention text to classify.", 0);

  // Short stable ids keep the prompt small and the mapping unambiguous.
  const idOf = new Map<string, Mention>();
  const lines = batch.map((m, i) => {
    const sid = `m${i}`;
    idOf.set(sid, m);
    return `${sid}|${(m.text || "").replace(/\s+/g, " ").slice(0, 220)}`;
  });
  const validIds = new Set(idOf.keys());

  const system =
    "You label the sentiment of public posts/headlines TOWARD a named brand or term. " +
    "pos = clearly favorable toward it, neg = clearly unfavorable toward it, neu = neutral, mixed, or merely mentions it. " +
    "Judge only the text given; if unsure, use neu with low confidence. " +
    "Return ONLY valid JSON, no prose, no markdown fences.";
  const user = `Brand/term: "${entity}"

Each line below is one public post: id|text. Label EVERY id.
Return JSON with EXACTLY this schema:
{"labels":[{"id":"m0","s":"pos"|"neg"|"neu","c":0.0-1.0}]}

Posts:
"""
${lines.join("\n")}
"""`;

  async function once(): Promise<MentionSentiment[] | null> {
    // Fail fast: no SDK retries and a hard per-call timeout so a slow/rate-
    // limited model degrades to an honest "unavailable" result instead of
    // hanging the whole serverless function past its maxDuration (which returns
    // FUNCTION_INVOCATION_TIMEOUT with no JSON body to the client).
    const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 28_000 });
    const msg = await client.messages.create({
      model: LLM_MODEL, max_tokens: 2000, system,
      messages: [{ role: "user", content: user }],
    });
    const block = msg.content.find((b) => b.type === "text");
    const labels = parseSentimentLabels(block && block.type === "text" ? block.text : "", validIds);
    return labels.length ? labels : null;
  }

  try {
    const labels = (await once()) || (await once());
    if (!labels) return UNAVAILABLE("Sentiment classification returned unparseable output.", batch.length);
    // Map short ids back to the real mention ids.
    const mapped: MentionSentiment[] = labels.map((l) => {
      const m = idOf.get(l.id)!;
      return { ...l, id: m.id || m.url || l.id };
    });
    return { ...summarizeSentiment(mapped, batch.length), labels: mapped };
  } catch (e: any) {
    const m = String(e?.message || "error");
    if (/credit balance|billing|too low|insufficient/i.test(m)) return UNAVAILABLE("Sentiment paused - Anthropic account out of credits.", batch.length);
    if (/401|invalid x-api-key|authentication/i.test(m)) return UNAVAILABLE("Sentiment unavailable - ANTHROPIC_API_KEY appears invalid.", batch.length);
    if (/429|rate limit/i.test(m)) return UNAVAILABLE("Sentiment rate-limited - try again shortly.", batch.length);
    return UNAVAILABLE(`Sentiment classification failed: ${m.slice(0, 140)}.`, batch.length);
  }
}
