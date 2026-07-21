// Detailed rating report + Markdown export. Pure functions computed from the
// report data - no AI, always available. Explains exactly how the score was
// built so the rating is fully auditable.

import { bandLabel, fmtDate } from "./ui";
import type {
  Report,
  RatingReport,
  RatingReportGroup,
  EvidenceItem,
  OsintDossier,
} from "./types";

const BASELINE = 40;

// Map an evidence label to a methodology category.
function categorize(label: string): string {
  const l = label.toLowerCase();
  if (/credible|fake|fact-check|reputation/.test(l)) return "Reputation & known lists";
  if (/domain|registrant|whois|registrar|impersonation|typosquat/.test(l)) return "Domain & ownership";
  if (/host|asn|datacenter|cdn|server|adversary/.test(l)) return "Hosting & origin";
  if (/about|contact|author|byline|transparency|corrections/.test(l)) return "Transparency signals";
  if (/https|certificate|ssl|mail|spf|dkim|dmarc/.test(l)) return "Security & authentication";
  if (/sensational|emotional|sourcing|ai-generated|content/.test(l)) return "Content signals";
  return "Other signals";
}

export function buildRatingReport(report: Report): RatingReport {
  const groupsMap = new Map<string, EvidenceItem[]>();
  for (const item of report.risk.evidence) {
    const cat = categorize(item.label);
    if (!groupsMap.has(cat)) groupsMap.set(cat, []);
    groupsMap.get(cat)!.push(item);
  }

  const groups: RatingReportGroup[] = Array.from(groupsMap.entries())
    .map(([category, items]) => ({
      category,
      items,
      subtotal: items.reduce((s, i) => s + i.impact, 0),
    }))
    .sort((a, b) => Math.abs(b.subtotal) - Math.abs(a.subtotal));

  const increasingTotal = report.risk.evidence
    .filter((e) => e.impact > 0)
    .reduce((s, i) => s + i.impact, 0);
  const decreasingTotal = report.risk.evidence
    .filter((e) => e.impact < 0)
    .reduce((s, i) => s + i.impact, 0);

  const bandExplanation =
    `The score of ${report.risk.score}/100 falls in the ${bandLabel(report.risk.band)} band ` +
    `(0–35 likely legitimate · 36–65 unknown · 66–100 high risk). ` +
    `Starting from a neutral baseline of ${BASELINE}, risk-increasing signals added +${increasingTotal} ` +
    `and risk-decreasing signals subtracted ${Math.abs(decreasingTotal)}.`;

  const confidenceExplanation =
    report.risk.confidence === "High"
      ? "Confidence is High because a strong signal (a known credible/fake match or a fact-check hit) was available."
      : `Confidence is ${report.risk.confidence}, based on how many independent data sources returned usable data.`;

  return {
    domain: report.domain,
    score: report.risk.score,
    band: report.risk.band,
    confidence: report.risk.confidence,
    baseline: BASELINE,
    groups,
    increasingTotal,
    decreasingTotal,
    bandExplanation,
    confidenceExplanation,
  };
}

function impactStr(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${n}`;
  return "0";
}

/** Full human-readable report as Markdown for download. */
export function reportToMarkdown(
  report: Report,
  rating: RatingReport,
  dossier?: OsintDossier | null,
): string {
  const i = report.infrastructure;
  const dom = i.domain.value;
  const host = i.hosting.value;
  const ssl = i.ssl.value;
  const tech = i.tech.value;
  const arch = i.archive.value;
  const L: string[] = [];

  L.push(`# TruthLens report - ${report.domain}`);
  L.push("");
  L.push(`> Decision-support tool - **not a verdict**. Indicators only.`);
  L.push("");
  L.push(`- **URL:** ${report.finalUrl || report.url}`);
  L.push(`- **Analyzed:** ${fmtDate(report.fetchedAt)}`);
  L.push(`- **Verdict:** ${bandLabel(report.risk.band)} - score ${report.risk.score}/100 - confidence ${report.risk.confidence}`);
  L.push("");

  L.push(`## Rating breakdown`);
  L.push("");
  L.push(rating.bandExplanation);
  L.push("");
  L.push(rating.confidenceExplanation);
  L.push("");
  L.push(`Baseline: **${rating.baseline}** · risk-increasing total: **+${rating.increasingTotal}** · risk-decreasing total: **${rating.decreasingTotal}** · final: **${rating.score}**`);
  L.push("");
  for (const g of rating.groups) {
    L.push(`### ${g.category}  (net ${impactStr(g.subtotal)})`);
    for (const it of g.items) {
      L.push(`- **${impactStr(it.impact)}** - ${it.label}: ${it.detail}`);
    }
    L.push("");
  }

  L.push(`## Infrastructure`);
  L.push("");
  L.push(`| Field | Value |`);
  L.push(`|---|---|`);
  L.push(`| Registrar | ${dom?.registrar || " - "} |`);
  L.push(`| Created | ${fmtDate(dom?.createdAt)} |`);
  L.push(`| Registrant | ${dom?.registrantOrg || (dom?.privacyProtected ? "Privacy-protected" : " - ")} |`);
  L.push(`| IP | ${host?.ip || " - "} |`);
  L.push(`| ASN | ${host?.asn || " - "} ${host?.asnOrg ? "(" + host.asnOrg + ")" : ""} |`);
  L.push(`| Hosting country | ${host?.cdnMasksOrigin ? "CDN edge (masked)" : host?.country || " - "} |`);
  L.push(`| SSL issuer | ${ssl?.issuer || " - "} |`);
  L.push(`| SAN siblings | ${ssl?.sanDomains.length || 0} |`);
  L.push(`| CMS / tech | ${[tech?.cms, ...(tech?.frameworks || [])].filter(Boolean).join(", ") || " - "} |`);
  L.push(`| First archived | ${fmtDate(arch?.firstSeen)} (${arch?.snapshotCount || 0} snapshots) |`);
  L.push("");

  if (report.network.nodes.length > 1) {
    const siblings = report.network.nodes.filter((n) => n.kind === "domain").map((n) => n.label);
    L.push(`## Operator network`);
    L.push(`${siblings.length} linked domain(s): ${siblings.join(", ")}`);
    L.push("");
  }

  if (report.contentAnalysis.available) {
    const c = report.contentAnalysis;
    L.push(`## Content analysis`);
    L.push(`- Sensationalism: ${c.sensationalism}/100`);
    L.push(`- Emotional manipulation: ${c.emotionalManipulation}/100`);
    L.push(`- Sourcing quality: ${c.sourcingQuality}/100`);
    L.push(`- AI-generated likelihood: ${c.aiGeneratedLikelihood}/100`);
    L.push(`- Summary: ${c.summary}`);
    if (c.redFlags.length) L.push(`- Red flags: ${c.redFlags.join("; ")}`);
    L.push("");
  }

  if (dossier?.available) {
    L.push(`## Deep OSINT findings`);
    L.push(`_Confidence: ${dossier.confidence}. Open-web research - indicators with sources, not proof._`);
    L.push("");
    if (dossier.summary) L.push(dossier.summary);
    L.push("");
    if (dossier.entities.length) {
      L.push(`### People & organizations`);
      for (const e of dossier.entities) L.push(`- **${e.name}** (${e.role}) - ${e.evidence}`);
      L.push("");
    }
    if (dossier.affiliations.length) { L.push(`### Affiliations`); dossier.affiliations.forEach((a) => L.push(`- ${a}`)); L.push(""); }
    if (dossier.socialProfiles.length) { L.push(`### Social profiles`); dossier.socialProfiles.forEach((s) => L.push(`- ${s.platform}: ${s.handle} ${s.url}`)); L.push(""); }
    if (dossier.funding) { L.push(`### Funding / monetization`); L.push(dossier.funding); L.push(""); }
    if (dossier.reputation) { L.push(`### Reputation`); L.push(dossier.reputation); L.push(""); }
    if (dossier.controversies.length) { L.push(`### Controversies`); dossier.controversies.forEach((c) => L.push(`- ${c}`)); L.push(""); }
    if (dossier.relatedSites.length) { L.push(`### Related sites`); L.push(dossier.relatedSites.join(", ")); L.push(""); }
    if (dossier.citations.length) {
      L.push(`### Sources`);
      dossier.citations.forEach((c) => L.push(`- [${c.title || c.url}](${c.url})`));
      L.push("");
    }
  }

  L.push(`---`);
  L.push(`_Generated by TruthLens. Attribution is probabilistic; geolocation is approximate and CDNs/VPNs/Tor mask true origin._`);
  return L.join("\n");
}
