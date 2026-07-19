// Brand Watch threat scoring — pure logic, no network. Produces indicators that
// each carry level + signals + alternative explanation, and returns Unknown when
// the data can't support a signal (never fabricates to fill a panel).

import { RUBRIC_VERSION, sentimentScore } from "./sentiment";
import { clusterNearDuplicates } from "@/lib/similarity";
import {
  mentionDomains, campaignMatch, stateMediaMatch, foreignAgentMatch, ioReferenceCounts,
} from "@/lib/io-reference";
import type { Indicator, Level, Mention, SourceStatus, ThreatResult, ThreatStatus } from "./types";

const WEIGHTS: Record<string, number> = {
  coordination: 0.22,
  amplification: 0.16,
  negative: 0.16,
  cross_source: 0.14,
  volume: 0.12,
  concentration: 0.10,
  foreign: 0.10,
  // documented_campaign / foreign_agent are intentionally absent → weight 0.
  // They render as informational corroboration in P3; scoring weight + the single
  // RUBRIC_VERSION bump land in P4 so historical scores stay comparable.
};

function levelFor(score: number): Level {
  if (score >= 66) return "High";
  if (score >= 34) return "Medium";
  return "Low";
}
function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function ind(key: string, label: string, score: number, confidence: number,
            signals: string[], alternative: string, detail: string): Indicator {
  const level: Level = confidence < 0.15 ? "Unknown" : levelFor(score);
  return { key, label, level, score: clamp(score), confidence: Math.round(confidence * 100) / 100, signals, alternative, detail };
}

export function computeThreat(
  entity: string,
  mentions: Mention[],
  sources: SourceStatus[],
  baseline?: number,
): ThreatResult {
  const generatedAt = new Date().toISOString();
  const total = mentions.length;
  const base = {
    entity, sources, totalMentions: total,
    totalAccounts: new Set(mentions.map((m) => m.accountId || m.account).filter(Boolean)).size,
    rubricVersion: RUBRIC_VERSION, generatedAt,
  };

  if (total === 0) {
    const anyConnected = sources.some((s) => s.connected);
    return {
      ...base, score: null, status: "UNKNOWN", indicators: [], evidence: [], trend: [],
      note: anyConnected
        ? "No public mentions found for this entity in the connected sources — Unknown, not necessarily calm."
        : "No sources connected. Add source keys (or check connectivity) to get a reading.",
    };
  }

  // Cluster by NEAR-duplicate content (Unicode-aware, catches paraphrases and
  // all scripts) — one shared similarity core.
  const groups = clusterNearDuplicates(mentions, (m) => m.text);

  const indicators: Indicator[] = [];

  // 1. Coordination — near-identical content from >=2 distinct accounts.
  const clusters = groups.filter(
    (g) => new Set(g.map((m) => m.accountId || m.account)).size >= 2,
  );
  const coordPosts = clusters.reduce((n, g) => n + g.length, 0);
  const coordShare = coordPosts / total;
  indicators.push(ind(
    "coordination", "Coordination",
    coordShare * 130, total >= 5 ? 0.9 : 0.5,
    [`${clusters.length} identical-content clusters across distinct accounts`,
     `${coordPosts}/${total} mentions are near-duplicates`],
    "Organic virality — many people independently resharing the same headline or quote.",
    `${clusters.length} clusters · ${coordPosts}/${total} mentions`,
  ));

  // 2. Amplification — duplicate-content volume (regardless of who posts it).
  const dupPosts = groups.filter((g) => g.length >= 2).reduce((n, g) => n + g.length, 0);
  const dupShare = dupPosts / total;
  indicators.push(ind(
    "amplification", "Amplification pattern",
    dupShare * 120, total >= 5 ? 0.8 : 0.4,
    [`${dupPosts}/${total} mentions repeat identical text`],
    "Syndication — outlets and aggregators republishing the same wire copy.",
    `${dupPosts}/${total} duplicate mentions`,
  ));

  // 3. Negative sentiment skew (versioned lexicon).
  const sents = mentions.map((m) => sentimentScore(m.text));
  const nonZero = sents.filter((s) => s !== 0);
  const avg = nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
  indicators.push(ind(
    "negative", "Negative sentiment skew",
    -avg * 100, nonZero.length ? Math.min(1, nonZero.length / total) : 0.1,
    [`Average tone ${avg >= 0 ? "+" : ""}${avg.toFixed(2)} over ${nonZero.length} scored mentions (${RUBRIC_VERSION})`],
    "A genuinely bad news event, not a manufactured attack — negativity can be warranted.",
    `avg sentiment ${avg.toFixed(2)}`,
  ));

  // 4. Cross-source spread.
  const srcCounts = new Map<string, number>();
  for (const m of mentions) srcCounts.set(m.source, (srcCounts.get(m.source) || 0) + 1);
  const multiSrcClaims = groups.filter((g) => new Set(g.map((m) => m.source)).size >= 2).length;
  const cross = srcCounts.size * 18 + (multiSrcClaims ? 30 : 0);
  indicators.push(ind(
    "cross_source", "Cross-source spread",
    cross, 0.8,
    [`Appears on ${srcCounts.size} platform(s)`,
     ...(multiSrcClaims ? [`${multiSrcClaims} identical claim(s) span multiple platforms`] : [])],
    "A major story naturally gets picked up everywhere at once.",
    `${srcCounts.size} sources${multiSrcClaims ? ` · ${multiSrcClaims} cross-platform claims` : ""}`,
  ));

  // 5. Volume burst — vs a stored baseline, else hourly buckets in-window.
  let volScore = 0, volConf = 0.2, volSignals: string[] = ["Not enough history for a baseline"], volDetail = "insufficient history";
  if (baseline && baseline > 0) {
    const ratio = total / baseline;
    volScore = (ratio - 1) * 45; volConf = 0.85;
    volSignals = [`${ratio.toFixed(1)}× the ${Math.round(baseline)}-mention baseline`];
    volDetail = `${ratio.toFixed(1)}× baseline`;
  } else {
    const buckets = hourBuckets(mentions);
    if (buckets.length >= 3) {
      const counts = buckets.map((b) => b.count).sort((a, b) => a - b);
      const median = counts[Math.floor(counts.length / 2)] || 1;
      const latest = buckets[buckets.length - 1].count;
      const ratio = latest / median;
      volScore = (ratio - 1) * 45; volConf = 0.7;
      volSignals = [`${ratio.toFixed(1)}× the typical hourly volume`];
      volDetail = `${ratio.toFixed(1)}× typical`;
    }
  }
  indicators.push(ind("volume", "Volume burst", volScore, volConf, volSignals,
    "Ordinary news-cycle timing — attention spikes around real events.", volDetail));

  // 6. Narrative concentration — one storyline dominating.
  const topCluster = Math.max(0, ...groups.map((g) => g.length));
  const concShare = topCluster / total;
  indicators.push(ind(
    "concentration", "Narrative concentration",
    concShare * 100, Math.min(1, total / 5),
    [`Largest single message holds ${topCluster}/${total} mentions`],
    "A single dominant quote or headline that everyone is citing.",
    `top message ${topCluster}/${total}`,
  ));

  // 7. Foreign-influence — cross-language mirroring + source-country concentration.
  //    CORRELATION, not proof of state involvement. Unknown when coverage is thin.
  const langs = mentions.map((m) => m.lang).filter(Boolean) as string[];
  const countries = mentions.map((m) => m.country).filter(Boolean) as string[];
  const coverage = (langs.length + countries.length) / (total * 2);
  const langCounts = new Map<string, number>();
  for (const l of langs) langCounts.set(l, (langCounts.get(l) || 0) + 1);
  const multiLang = [...langCounts.values()].filter((n) => n >= 2).length;
  const countryCounts = new Map<string, number>();
  for (const c of countries) countryCounts.set(c, (countryCounts.get(c) || 0) + 1);
  const topCountryShare = countries.length ? Math.max(...countryCounts.values()) / countries.length : 0;
  const fSignals: string[] = [];
  if (multiLang >= 2) fSignals.push(`the claim appears in ${multiLang} languages`);
  if (countryCounts.size) fSignals.push(`${countryCounts.size} source countries (top holds ${Math.round(topCountryShare * 100)}%)`);
  if (!fSignals.length) fSignals.push("no language/country data available for this set");
  indicators.push(ind(
    "foreign", "Foreign-influence pattern",
    (multiLang - 1) * 26 + topCountryShare * 40,
    coverage >= 0.3 ? 0.6 : 0.1,
    fSignals,
    "A global topic is naturally discussed across many languages and countries — this indicates correlation, not proof of state involvement.",
    `${langCounts.size} langs · ${countryCounts.size} countries`,
  ));

  // 8. Documented-campaign / state-media overlap — do any amplifying domains
  //    appear in a PUBLISHED IO takedown report or a documented state-media list?
  //    Weight 0 for now (informational; scoring wiring + rubric bump land in P4).
  //    Reference ships EMPTY → Unknown ("cannot assess"), never a reassuring Low.
  const refCounts = ioReferenceCounts();
  const campaignRef = refCounts.campaigns + refCounts.stateMedia;
  const campaignHits: string[] = [];
  if (campaignRef > 0) {
    for (const m of mentions) {
      for (const d of mentionDomains(m)) {
        const c = campaignMatch(d), s = stateMediaMatch(d);
        if (c) campaignHits.push(`${d} — documented in “${c.campaign || "campaign"}” (${c.disclosedBy || "report"})`);
        else if (s) campaignHits.push(`${d} — documented state-affiliated media${s.label ? ` (${s.label})` : ""}`);
      }
    }
  }
  const uniqCampaignHits = [...new Set(campaignHits)];
  indicators.push(ind(
    "documented_campaign", "Documented-campaign / state-media overlap",
    uniqCampaignHits.length ? 80 : 0,
    campaignRef === 0 ? 0 : (uniqCampaignHits.length ? 0.85 : 0.6),
    campaignRef === 0
      ? ["Reference dataset not populated (0 entries) — populate data/io-reference/ to enable this check."]
      : (uniqCampaignHits.length
          ? uniqCampaignHits.slice(0, 6)
          : [`No overlap with the ${campaignRef} documented reference domain(s).`]),
    "Appearing on or citing a documented outlet is not proof this specific content is part of that campaign — syndication and legitimate citation also produce overlap.",
    campaignRef === 0 ? "reference empty" : `${uniqCampaignHits.length} matched domain(s) / ${campaignRef} ref`,
  ));

  // 9. Registered foreign-agent nexus — do amplifying domains belong to an org
  //    with a LAWFUL public foreign-agent disclosure (e.g. FARA)? A registration
  //    is a public administrative filing, NOT an accusation. Weight 0 for now.
  const faHits: string[] = [];
  if (refCounts.foreignAgents > 0) {
    for (const m of mentions) {
      for (const d of mentionDomains(m)) {
        const fa = foreignAgentMatch(d);
        if (fa) faHits.push(`${d} — ${fa.org} (${fa.registry || "registry"}${fa.registrationNo ? ` #${fa.registrationNo}` : ""})`);
      }
    }
  }
  const uniqFaHits = [...new Set(faHits)];
  indicators.push(ind(
    "foreign_agent", "Registered foreign-agent nexus",
    uniqFaHits.length ? 70 : 0,
    refCounts.foreignAgents === 0 ? 0 : (uniqFaHits.length ? 0.8 : 0.6),
    refCounts.foreignAgents === 0
      ? ["Reference dataset not populated (0 entries) — populate data/io-reference/foreign-agent-registries.json (see scripts/refresh-fara.ts)."]
      : (uniqFaHits.length
          ? uniqFaHits.slice(0, 6)
          : [`No overlap with the ${refCounts.foreignAgents} registered foreign-agent domain(s).`]),
    "A foreign-agent registration is a lawful public disclosure, not an accusation — registered entities also produce ordinary, legitimate content.",
    refCounts.foreignAgents === 0 ? "reference empty" : `${uniqFaHits.length} matched domain(s)`,
  ));

  // Combine (Unknown signals excluded).
  const scored = indicators.filter((i) => i.level !== "Unknown");
  const num = scored.reduce((n, i) => n + i.score * (WEIGHTS[i.key] || 0) * i.confidence, 0);
  const den = scored.reduce((n, i) => n + (WEIGHTS[i.key] || 0) * i.confidence, 0);
  const score = den ? clamp(num / den) : null;
  const status: ThreatStatus = score === null ? "UNKNOWN"
    : score >= 66 ? "UNDER_ATTACK" : score >= 34 ? "ELEVATED" : "CALM";

  const evidence = [...mentions].sort((a, b) => (b.engagement || 0) - (a.engagement || 0)).slice(0, 12);
  const trend = hourBuckets(mentions).slice(-24);

  // Earliest OBSERVED node in the collected data (not the true origin).
  const timed = mentions.filter((m) => m.timestamp && !isNaN(Date.parse(m.timestamp)));
  const earliest = timed.length
    ? timed.reduce((a, b) => (Date.parse(a.timestamp!) <= Date.parse(b.timestamp!) ? a : b))
    : undefined;

  return {
    ...base, score, status,
    indicators: indicators.sort((a, b) => (b.score * b.confidence) - (a.score * a.confidence)),
    evidence, trend, earliest,
  };
}

function hourBuckets(mentions: Mention[]): { ts: string; count: number }[] {
  const b = new Map<string, number>();
  for (const m of mentions) {
    if (!m.timestamp) continue;
    const d = new Date(m.timestamp);
    if (isNaN(d.getTime())) continue;
    const key = d.toISOString().slice(0, 13) + ":00";
    b.set(key, (b.get(key) || 0) + 1);
  }
  return [...b.entries()].sort((a, b2) => a[0].localeCompare(b2[0])).map(([ts, count]) => ({ ts, count }));
}
