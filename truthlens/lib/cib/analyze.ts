// CIB — Coordinated Inauthentic Behavior analysis. Given public mentions of an
// entity, computes coordination signals and grades a Coordination Likelihood
// (None / Weak / Moderate / Strong) with the RAW evidence behind each grade.
//
// HARD RULE (mirrors the CIB spec + TruthLens CLAUDE.md): this NEVER attributes
// activity to a state or named actor. There is no country/actor verdict. The
// ceiling is "Coordination Likelihood: Strong — actor UNDETERMINED." Every report
// carries the verbatim Attribution & Limitations section. Do not add an actor
// field: coordination is a behavioural pattern, not proof of who is behind it.

import type { Mention, ArchiveLink } from "@/lib/narrative/types";
import { clusterNearDuplicates } from "@/lib/similarity";
import {
  mentionDomains, campaignMatch, stateMediaMatch, foreignAgentMatch, ioReferenceCounts,
} from "@/lib/io-reference";
import { assessAccount } from "@/lib/authenticity";
import type { AuthenticityAssessment, AccountProfile } from "@/lib/authenticity";
import {
  detectBursts, hourBandConcentration, creationClustering,
  BURST_WINDOW_MIN, HOUR_BAND_HOURS, HOUR_BAND_MIN_SHARE, HOUR_BAND_MIN_DAYS, CREATION_MIN_ACCOUNTS,
} from "@/lib/narrative/fingerprints";

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
  archives?: ArchiveLink[]; // preserved copies of the top evidence URLs
  /** Per-amplifying-account authenticity assessments (additive; probabilistic —
   * score + confidence + evidence, never a binary fake/real label). */
  authenticity?: { account: string; assessment: AuthenticityAssessment }[];
}

const ATTRIBUTION =
  "Actor is UNDETERMINED. Coordination is a behavioural pattern, not proof of state sponsorship or of who is behind it. " +
  "These are hypotheses for a human to evaluate — not a verdict.";

const NEXT_STEPS = [
  "Cross-check the flagged accounts against the platforms' published CIB / takedown disclosures.",
  "Preserve the evidence posts and account snapshots before they change or are removed.",
  "Consult a journalist or an OSINT researcher before publishing any conclusion.",
  "Treat account-profile and linguistic cues as weak — never as proof of a specific origin.",
];

export function analyzeCib(
  entity: string,
  mentions: Mention[],
  /** Optional platform-account profiles (keyed by accountId/handle) collected by
   * the env-gated provider — upgrades the authenticity layer from Phase-1-only.
   * Absent → identical behavior to before (additive). */
  profiles?: Record<string, AccountProfile>,
): CibReport {
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

  // --- Temporal fingerprints (O(n log n) bursts + posting-hour band) ---
  const timed = mentions.filter((m) => m.timestamp && !isNaN(Date.parse(m.timestamp)))
    .map((m) => ({ t: Date.parse(m.timestamp!), account: m.accountId || m.account || "?" }));
  const { bursts, biggest: biggestBurst } = detectBursts(timed);
  const hourBand = hourBandConcentration(timed.map((x) => x.t));

  // --- Account-creation clustering (when the source exposes creation dates) ---
  const creationByAccount = new Map<string, string>();
  for (const m of mentions) {
    const id = m.accountId || m.account;
    if (id && m.accountCreatedAt) creationByAccount.set(id, m.accountCreatedAt);
  }
  const creation = creationClustering([...creationByAccount.values()]);

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
  // Posting-hour concentration — only meaningful when SUSTAINED across days
  // (a one-day breaking-news spike must NOT trip this above Low).
  const bandStrong = hourBand.share >= HOUR_BAND_MIN_SHARE && hourBand.days >= HOUR_BAND_MIN_DAYS;
  const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;
  signals.push({
    name: "Posting-hour concentration",
    confidence: hourBand.total >= 6 && hourBand.days >= HOUR_BAND_MIN_DAYS ? (bandStrong ? "Medium" : "Low") : "Not collected",
    evidence: hourBand.total >= 6
      ? [`${Math.round(hourBand.share * 100)}% of posts fall in the ${pad(hourBand.band[0])}–${pad(hourBand.band[1])} UTC window across ${hourBand.days} day(s).`]
      : ["Not enough timestamped items across days to assess a posting-hour pattern."],
    alternative: "A community concentrated in one timezone posts in the same hours — an activity rhythm, never mapped to a country.",
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
    name: "Account-creation clustering",
    confidence: creation.collected >= 2 ? (creation.clustered >= CREATION_MIN_ACCOUNTS ? "Medium" : "Low") : "Not collected",
    evidence: creation.collected >= 2
      ? [creation.clustered >= CREATION_MIN_ACCOUNTS
          ? `${creation.clustered} involved accounts were created within ${creation.windowDays} days (${creation.earliest} → ${creation.latest}).`
          : `No creation-date clustering (max ${creation.clustered} accounts within ${creation.windowDays} days, over ${creation.collected} with dates).`]
      : ["Not collected — creation dates available only from sources that expose them (e.g. Bluesky)."],
    alternative: "A community or campaign can legitimately onboard together around the same launch or event.",
  });
  signals.push({
    name: "Network / who-amplifies-whom (weak)",
    confidence: "Not collected",
    evidence: ["Not collected — public free sources don't expose a repost/quote graph; requires a platform API."],
    alternative: "n/a — clustering alone never identifies an actor.",
  });

  // --- Documented-reference overlap (organizations only; leads, never verdicts) ---
  // Ships EMPTY → "Not collected" until an operator populates data/io-reference/.
  const refCounts = ioReferenceCounts();
  const campaignRef = refCounts.campaigns + refCounts.stateMedia;
  const campaignHits = new Set<string>();
  const faHits = new Set<string>();
  for (const m of mentions) {
    for (const d of mentionDomains(m)) {
      if (campaignRef > 0) {
        const c = campaignMatch(d), s = stateMediaMatch(d);
        if (c) campaignHits.add(`${d} — documented in “${c.campaign || "campaign"}” (${c.disclosedBy || "report"})`);
        else if (s) campaignHits.add(`${d} — documented state-affiliated media${s.label ? ` (${s.label})` : ""}`);
      }
      if (refCounts.foreignAgents > 0) {
        const fa = foreignAgentMatch(d);
        if (fa) faHits.add(`${d} — ${fa.org} (${fa.registry || "registry"}${fa.registrationNo ? ` #${fa.registrationNo}` : ""})`);
      }
    }
  }
  signals.push({
    name: "Documented-campaign / state-media overlap",
    confidence: campaignRef === 0 ? "Not collected" : (campaignHits.size ? "Medium" : "Low"),
    evidence: campaignRef === 0
      ? ["Not collected — reference dataset not populated (populate data/io-reference/)."]
      : (campaignHits.size ? [...campaignHits].slice(0, 6) : [`No overlap with the ${campaignRef} documented reference domain(s).`]),
    alternative: "Citing or syndicating a documented outlet is not proof this specific content is part of that campaign.",
  });
  signals.push({
    name: "Registered foreign-agent nexus",
    confidence: refCounts.foreignAgents === 0 ? "Not collected" : (faHits.size ? "Medium" : "Low"),
    evidence: refCounts.foreignAgents === 0
      ? ["Not collected — reference dataset not populated (see scripts/refresh-fara.ts)."]
      : (faHits.size ? [...faHits].slice(0, 6) : [`No overlap with the ${refCounts.foreignAgents} registered foreign-agent domain(s).`]),
    alternative: "A foreign-agent registration is a lawful public disclosure, not an accusation — registered entities also produce ordinary content.",
  });

  // --- Grade the Coordination Likelihood from the signals ---
  const hasCopypasta = clusters.length > 0;
  const strongCopypasta = clusters.some((c) => c.accounts >= 3 || c.size >= 4);
  // Corroborating temporal fingerprints (each SUSTAINED, not a one-day spike).
  const corroborating = (bandStrong ? 1 : 0) + (creation.clustered >= CREATION_MIN_ACCOUNTS ? 1 : 0);
  const likelihood: Likelihood =
    (hasCopypasta && bursts >= 1 && strongCopypasta) || (strongCopypasta && corroborating >= 1) ? "Strong"
      : (hasCopypasta && bursts >= 1) || strongCopypasta || (hasCopypasta && corroborating >= 1) ? "Moderate"
        : hasCopypasta || bursts >= 1 || corroborating >= 1 ? "Weak"
          : "None";

  const profileCount = profiles ? Object.keys(profiles).length : 0;
  const collectionGaps = [
    profileCount > 0
      ? `Account-profile data collected for ${profileCount} amplifying account(s) via the platform provider; remaining accounts not collected.`
      : "Account-profile signals not collected (no platform API configured).",
    "Amplification/repost network not collected (no platform API configured).",
  ];

  // --- Account authenticity (ADDITIVE): per-amplifying-account assessment over
  //     the mention stream, reusing the near-dup groups computed above. ---
  const byAccount = new Map<string, Mention[]>();
  for (const m of mentions) {
    const id = m.accountId || m.account;
    if (id) byAccount.set(id, [...(byAccount.get(id) || []), m]);
  }
  const authenticity = [...byAccount.entries()]
    .filter(([, ms]) => ms.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8)
    .map(([account, own]) => ({
      account,
      assessment: assessAccount({
        account, own, all: mentions, clusters: groups,
        profile: profiles?.[account] ?? null,
      }),
    }));

  return {
    entity, likelihood, totalItems: total, accounts, signals, clusters,
    collectionGaps, attribution: ATTRIBUTION, nextSteps: NEXT_STEPS, generatedAt,
    ...(authenticity.length ? { authenticity } : {}),
  };
}

function countBy(arr: string[]): number[] {
  const m = new Map<string, number>();
  for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
  return [...m.values()];
}
