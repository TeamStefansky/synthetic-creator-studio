// CIB — Coordinated Inauthentic Behavior analysis. Given public mentions of an
// entity, computes coordination signals and grades a Coordination Likelihood
// (None / Weak / Moderate / Strong) with the RAW evidence behind each grade.
//
// HARD RULE (mirrors the CIB spec + TruthLens CLAUDE.md): this NEVER attributes
// activity to a state or named actor. There is no country/actor verdict. The
// ceiling is "Coordination Likelihood: Strong — actor UNDETERMINED." Every report
// carries the verbatim Attribution & Limitations section. Do not add an actor
// field: coordination is a behavioural pattern, not proof of who is behind it.

import type { Mention } from "@/lib/narrative/types";
import { clusterNearDuplicates } from "@/lib/similarity";

export type Likelihood = "None" | "Weak" | "Moderate" | "Strong";

export interface CibSignal {
  name: string;
  confidence: "Low" | "Medium" | "High" | "Not collected";
  evidence: string[];
  /** an innocent explanation for the same observation */
  alternative: string;
}

export interface CibCluster { text: string; accounts: number; size: number; sources: string[]; }

export interface CibReport {
  entity: string;
  likelihood: Likelihood;
  totalItems: number;
  accounts: number;
  signals: CibSignal[];
  clusters: CibCluster[];
  collectionGaps: string[];
  attribution: string; // always the UNDETERMINED statement
  nextSteps: string[];
  generatedAt: string;
}

const BURST_WINDOW_MIN = 10;

const ATTRIBUTION =
  "Actor is UNDETERMINED. Coordination is a behavioural pattern, not proof of state sponsorship or of who is behind it. " +
  "These are hypotheses for a human to evaluate — not a verdict.";

const NEXT_STEPS = [
  "Cross-check the flagged accounts against the platforms' published CIB / takedown disclosures.",
  "Preserve the evidence posts and account snapshots before they change or are removed.",
  "Consult a journalist or an OSINT researcher before publishing any conclusion.",
  "Treat account-profile and linguistic cues as weak — never as proof of a specific origin.",
];

export function analyzeCib(entity: string, mentions: Mention[]): CibReport {
  const generatedAt = new Date().toISOString();
  const total = mentions.length;
  const accounts = new Set(mentions.map((m) => m.accountId || m.account).filter(Boolean)).size;

  // --- Content similarity: near-duplicate clusters (Unicode-aware, catches
  //     paraphrases + all scripts) via the shared similarity core ---
  const groups = clusterNearDuplicates(mentions, (m) => m.text);
  const clusters: CibCluster[] = groups
    .map((g) => ({ items: g, accts: new Set(g.map((m) => m.accountId || m.account)) }))
    .filter((c) => c.accts.size >= 2)
    .sort((a, b) => b.items.length - a.items.length)
    .slice(0, 10)
    .map((c) => ({ text: c.items[0].text.slice(0, 160), accounts: c.accts.size, size: c.items.length, sources: [...new Set(c.items.map((m) => m.source))] }));

  // --- Temporal: synchronized bursts (default 10-min window, >=2 accounts) ---
  const timed = mentions.filter((m) => m.timestamp && !isNaN(Date.parse(m.timestamp)))
    .map((m) => ({ t: Date.parse(m.timestamp!), a: m.accountId || m.account || "?" }))
    .sort((x, y) => x.t - y.t);
  let bursts = 0, biggestBurst = 0;
  for (let i = 0; i < timed.length; i++) {
    const windowEnd = timed[i].t + BURST_WINDOW_MIN * 60_000;
    const win = timed.filter((x) => x.t >= timed[i].t && x.t <= windowEnd);
    const distinct = new Set(win.map((x) => x.a)).size;
    if (win.length >= 3 && distinct >= 2) { bursts++; biggestBurst = Math.max(biggestBurst, win.length); }
  }

  // --- Amplification (partial without a platform repost graph) ---
  const topAcctShare = accounts ? Math.max(...countBy(mentions.map((m) => m.accountId || m.account || "?"))) / total : 0;

  const signals: CibSignal[] = [];
  signals.push({
    name: "Content similarity (copypasta)",
    confidence: clusters.length ? (total >= 6 ? "High" : "Medium") : "Low",
    evidence: clusters.length
      ? clusters.slice(0, 3).map((c) => `${c.size} near-identical posts from ${c.accounts} accounts across ${c.sources.join(", ")}: “${c.text.slice(0, 80)}…”`)
      : ["No near-duplicate clusters found in the collected set."],
    alternative: "Wire copy / syndication: outlets and users resharing the same headline or quote verbatim.",
  });
  signals.push({
    name: "Temporal synchronization",
    confidence: timed.length >= 4 ? (bursts ? "Medium" : "Low") : "Not collected",
    evidence: timed.length >= 4
      ? (bursts ? [`${bursts} synchronized burst(s) within ${BURST_WINDOW_MIN} min (largest: ${biggestBurst} posts from ≥2 accounts).`] : ["No synchronized bursts detected."])
      : ["Not enough timestamped items to assess timing."],
    alternative: "A real event breaking at a moment in time naturally produces a burst of independent posts.",
  });
  signals.push({
    name: "Amplification concentration",
    confidence: accounts >= 3 ? "Low" : "Not collected",
    evidence: accounts >= 3
      ? [`Top account holds ${Math.round(topAcctShare * 100)}% of the collected mentions.`]
      : ["Too few accounts to assess amplification."],
    alternative: "An official or highly active account posting frequently about its own topic.",
  });
  signals.push({
    name: "Account-profile signals (weak)",
    confidence: "Not collected",
    evidence: ["Not collected — requires a platform API (X/Telegram) exposing account age, avatar, follower ratios."],
    alternative: "n/a — this signal is weak and only ever corroborative, never proof.",
  });
  signals.push({
    name: "Network / who-amplifies-whom (weak)",
    confidence: "Not collected",
    evidence: ["Not collected — public free sources don't expose a repost/quote graph; requires a platform API."],
    alternative: "n/a — clustering alone never identifies an actor.",
  });

  // --- Grade the Coordination Likelihood from the strong signals ---
  const hasCopypasta = clusters.length > 0;
  const strongCopypasta = clusters.some((c) => c.accounts >= 3 || c.size >= 4);
  const likelihood: Likelihood =
    hasCopypasta && bursts >= 1 && strongCopypasta ? "Strong"
      : (hasCopypasta && bursts >= 1) || strongCopypasta ? "Moderate"
        : hasCopypasta || bursts >= 1 ? "Weak"
          : "None";

  const collectionGaps = [
    "Account-profile signals not collected (no platform API configured).",
    "Amplification/repost network not collected (no platform API configured).",
  ];

  return {
    entity, likelihood, totalItems: total, accounts, signals, clusters,
    collectionGaps, attribution: ATTRIBUTION, nextSteps: NEXT_STEPS, generatedAt,
  };
}

function countBy(arr: string[]): number[] {
  const m = new Map<string, number>();
  for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
  return [...m.values()];
}
