// OSINT research orchestrator - you write a QUERY, the tool goes out and
// collects from every source that is live, then compiles the 14-section report.
//
// It does automatically what an analyst did by hand: classify the query, run the
// relevant collectors (crt.sh CT logs, homepage tracker extraction + reverse-
// lookup pivots, documented host conduct, public attention/tone, and a match
// against the curated watchlist), assemble the findings into the template, and
// derive a confidence FROM THE EVIDENCE (never from a model).
//
// Frozen rules hold: attribution is organization/campaign-level (never a person);
// a not-connected source is disclosed, never faked (rule 7); no findings → the
// section is honestly "Not assessed" (rule 4); pure assembly is deterministic.

import { getText } from "@/lib/http";
import { extractGaIds, extractAdsenseIds } from "@/lib/trackers";
import { runPivot, type PivotResult, type AdapterResult, dedupeDomains } from "./adapters";
import { buildHostConduct, type HostConductProfile } from "@/lib/host-conduct";
import { getResolvedRules, type ResolvedRule } from "./watchlist";
import { compileReport, type ReportInput, type CompiledReport, type Confidence } from "./report";
import { collectSignalContext } from "@/lib/signal-context";
import { forecastNarrativeRisk, type RadarForecast } from "@/lib/forecast/radar";
import { narrateResearch } from "./narrate";
import { resolveDomainInfra, lookupDomainRdap, gdeltArticles, type DomainInfra, type DomainRdap, type NewsArticle } from "./collect";
import { buildAnnex, type ReportAnnex } from "./annex";
import { extractSelectors, briefTitle, type Selectors } from "./brief";
import { deepenDomain, collectNarrativeCoordination, documentedMatches, type DomainDeep, type NarrativeCoordination, type DocumentedHit } from "./deepen";

// v2: second-hop infra, co-hosting, site age, documented-reference match across
// every discovered domain, and narrative coordination via the shared CIB analyzer.
export const OSINT_RESEARCH_VERSION = "osint-research-v2";

export type QueryKind = "domain" | "asn" | "adsense_id" | "ga_id" | "freetext";

export interface ResearchFindings {
  kind: QueryKind;
  value: string;
  watchlist: ResolvedRule | null;
  crtsh?: AdapterResult;
  trackers: { gaIds: string[]; adsenseIds: string[] };
  pivots: PivotResult[];
  hostConduct?: HostConductProfile;
  forecast?: RadarForecast;
  infra?: DomainInfra;
  rdap?: DomainRdap;
  articles: NewsArticle[];
  /** v2 deep pass for a domain seed (second hop, co-hosting, age, documented refs). */
  deep?: DomainDeep;
  /** Documented-reference hits when there is no full domain deep pass (brief mode). */
  documentedHits?: DocumentedHit[];
  /** v2 narrative coordination (public mentions → shared CIB analyzer). */
  coordination?: NarrativeCoordination;
  toolsLive: string[];
  toolsNotConfigured: string[];
  log: string[];
}

/** Every documented-reference hit in the findings (seed first). */
export function allDocumentedHits(f: ResearchFindings): DocumentedHit[] {
  return [...(f.deep?.documented.seed || []), ...(f.deep?.documented.related || []), ...(f.documentedHits || [])];
}

// --- pure classification -----------------------------------------------------

export function classifyQuery(raw: string): { kind: QueryKind; value: string } {
  const q = (raw || "").trim();
  if (/^AS\d{2,7}$/i.test(q)) return { kind: "asn", value: q.toUpperCase() };
  if (/^ca-pub-\d{10,}$/i.test(q)) return { kind: "adsense_id", value: q };
  if (/^(ua-\d{4,}-\d+|g-[a-z0-9]{6,}|gtm-[a-z0-9]{4,})$/i.test(q)) return { kind: "ga_id", value: q.toUpperCase() };
  const host = q.toLowerCase().replace(/^[a-z]+:\/\//, "").split("/")[0].split("?")[0];
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return { kind: "domain", value: host };
  return { kind: "freetext", value: q };
}

// --- pure watchlist matching -------------------------------------------------

function regexSafe(pat: string): RegExp | null {
  try { return new RegExp(pat, "i"); } catch { return null; }
}

/** Does a query match a curated cluster? Domain patterns, ASN lists, AdSense ids. */
export function matchWatchlist(kind: QueryKind, value: string, rules: ResolvedRule[]): ResolvedRule | null {
  const v = value.toLowerCase();
  for (const r of rules) {
    const m: any = r.match || {};
    if (kind === "domain") {
      const ct: string[] = m.ct_log_domains || [];
      if (ct.some((p) => v.endsWith(p.replace(/^\*\./, ".")) || v === p.replace(/^\*\./, ""))) return r;
      const rx: string[] = m.new_domain_regex || [];
      if (rx.some((p) => regexSafe(p)?.test(v))) return r;
    }
    if (kind === "asn") {
      const asns: string[] = m.hosting_asn_any || [];
      if (asns.map((a) => a.toUpperCase()).includes(value.toUpperCase())) return r;
    }
    if (kind === "adsense_id") {
      const ids: string[] = m.adsense_pub_ids || [];
      if (ids.includes(value)) return r;
    }
  }
  return null;
}

// --- pure confidence derivation ---------------------------------------------

/** Derive overall confidence FROM EVIDENCE. Capped by the matched cluster's own
 * confidence; documented host conduct + corroborating pivot members raise it.
 * OSINT collection alone never asserts High without a documented anchor.
 * v2 corroboration: ≥ SHARED_IP_MIN discovered domains on the seed's own non-CDN
 * IP, or a Moderate/Strong coordination grade, count like ≥3 pivot members. A
 * seed listed in a cited reference dataset is a documented anchor. Coordination
 * is behavioural and never, on its own, lifts confidence to High. */
export function deriveConfidence(f: ResearchFindings): Confidence {
  const pivotMembers = f.pivots.reduce((s, p) => s + p.members.length, 0);
  const wl = f.watchlist?.confidence; // "high" | "moderate" | "low"
  const seedDocumented = (f.deep?.documented.seed.length || 0) > 0;
  const anchored = !!f.hostConduct?.matched || (!!wl && wl !== "low") || seedDocumented;
  const sharedInfra = !!f.deep?.sharedInfra.corroborates;
  const coordinated = f.coordination?.cib?.likelihood === "Strong" || f.coordination?.cib?.likelihood === "Moderate";
  const infraCorroborated = pivotMembers >= 3 || sharedInfra;
  if (wl === "high" && (f.hostConduct?.matched || infraCorroborated || seedDocumented)) return "High";
  if (anchored || infraCorroborated || coordinated) return "Moderate";
  return "Low";
}

// --- pure report assembly ----------------------------------------------------

function assetRows(f: ResearchFindings): string {
  const rows: string[] = [];
  const ct = f.crtsh?.members?.slice(0, 25) || [];
  for (const d of ct) rows.push(`| ${d} | site | web | observed in CT | crt.sh |`);
  const pivotMembers = dedupeDomains(f.pivots.flatMap((p) => p.members)).slice(0, 25);
  for (const d of pivotMembers) rows.push(`| ${d} | site | web | reverse-lookup | ${f.pivots.map((p) => p.connectedTools.join("/")).filter(Boolean).join(", ") || "pivot"} |`);
  for (const d of f.deep?.sharedInfra.sameIp || []) rows.push(`| ${d} | site | web | same non-CDN IP as seed (${f.infra?.ip}) | live DNS |`);
  for (const d of (f.deep?.coHosted.domains || []).slice(0, 15)) rows.push(`| ${d} | site | web | co-hosted on seed IP | reverse-IP |`);
  for (const h of allDocumentedHits(f)) rows.push(`| ${h.domain} | site | web | documented: ${h.kind} - ${h.label} | ${h.citation || "reference dataset"} |`);
  return rows.join("\n");
}

function infraRows(f: ResearchFindings): string {
  const rows: string[] = [];
  if (f.infra?.ip) rows.push(`| Resolved IP | ${f.infra.ip} | ${f.value} | DNS A record | live DNS |`);
  if (f.infra?.asn) rows.push(`| ASN / operator | ${f.infra.asn}${f.infra.org ? ` ${f.infra.org}` : ""} | ${f.value} | IP enrichment | live |`);
  if (f.infra?.country) rows.push(`| Hosting country | ${f.infra.country} | ${f.value} | IP geo (approx) | live |`);
  if (f.rdap?.registrar) rows.push(`| Registrar | ${f.rdap.registrar} | ${f.value} | RDAP | registry |`);
  if (f.rdap?.registrationDate) rows.push(`| Registered | ${f.rdap.registrationDate} | ${f.value} | RDAP | registry |`);
  if (f.rdap?.registrantOrg) rows.push(`| Registrant org | ${f.rdap.registrantOrg} | ${f.value} | RDAP (org, disclosed) | registry |`);
  for (const id of f.trackers.gaIds) rows.push(`| Google Analytics id | ${id} | ${f.value} | reverse-analytics | homepage |`);
  for (const id of f.trackers.adsenseIds) rows.push(`| AdSense pub id | ${id} | ${f.value} | reverse-adsense | homepage |`);
  if (f.hostConduct?.matched) rows.push(`| Host operator | ${f.hostConduct.org} | ${f.value} | documented conduct | host-conduct |`);
  const d = f.deep;
  if (d?.sharedInfra.seedOnCdn) rows.push(`| Edge network | ${d.sharedInfra.seedOnCdn} | ${f.value} | CDN - shared IPs not operator evidence | live |`);
  if (d?.sharedInfra.sameIp.length) rows.push(`| Shared IP (non-CDN) | ${f.infra?.ip} | ${d.sharedInfra.sameIp.join(", ")} | second-hop DNS | live DNS |`);
  if (d?.sharedInfra.sameAsn.length) rows.push(`| Shared network | ${f.infra?.asn} | ${d.sharedInfra.sameAsn.join(", ")} | second-hop DNS (weak: same ASN) | live DNS |`);
  if (d?.age.firstSeen) rows.push(`| First observed | ${d.age.firstSeen} (earliest observed, not creation) | ${f.value} | Wayback CDX (${d.age.snapshots} capture(s)) | archive.org |`);
  if (d?.age.recent) rows.push(`| Site age | ${d.age.ageDays} days | ${f.value} | recently stood up (≤ threshold) | Wayback/RDAP |`);
  return rows.join("\n");
}

/** Deterministic narrative-coordination prose (used when no LLM narrative). */
function coordinationProse(f: ResearchFindings): string | undefined {
  const c = f.coordination;
  if (!c) return undefined;
  if (!c.collected || !c.cib) {
    return `Narrative coordination: not collected (${c.note || "no data"}). Unknown is the correct answer when nothing was collected.`;
  }
  const cib = c.cib;
  const lines = [
    `Coordination Likelihood: ${cib.likelihood}${cib.likelihood === "Strong" ? " - actor UNDETERMINED" : ""} (${cib.totalItems} public mention(s), ${cib.accounts} distinct account(s); sources: ${c.sourcesLive.join(", ") || "none"}).`,
  ];
  for (const s of cib.signals.filter((x) => x.confidence !== "Not collected").slice(0, 5)) {
    lines.push(`- ${s.name} (${s.confidence}): ${s.evidence.slice(0, 2).join("; ")}. Could also be explained by: ${s.alternative}`);
  }
  if (cib.clusters.length) {
    const top = cib.clusters[0];
    lines.push(`- Largest near-duplicate cluster: ${top.size} item(s) across ${top.accounts} account(s) on ${top.sources.join("/")} - “${top.text.slice(0, 120)}”.`);
  }
  lines.push(cib.attribution);
  return lines.join("\n");
}

function actorRows(f: ResearchFindings): string {
  if (!f.watchlist) return "";
  return `| ${f.watchlist.attribution} | ${f.watchlist.cluster} | cited reporting: ${f.watchlist.reporting.join(", ")} | ${f.watchlist.confidence} |`;
}

function sourcesList(f: ResearchFindings): string {
  const src: string[] = [];
  if (f.crtsh?.url) src.push(f.crtsh.url);
  for (const p of f.pivots) for (const r of p.results) if (r.connected && r.url) src.push(r.url);
  if (f.watchlist) src.push(...f.watchlist.reporting);
  for (const fi of f.hostConduct?.findings || []) src.push(...fi.sources);
  for (const h of allDocumentedHits(f)) if (h.citation) src.push(`${h.citation} (documented: ${h.domain})`);
  if (f.deep?.age.firstSeen) src.push(`https://web.archive.org/web/*/${f.value} (Wayback CDX)`);
  for (const a of f.articles.slice(0, 10)) src.push(`${a.title || a.domain} - ${a.url}${a.date ? ` (${a.date})` : ""}`);
  return [...new Set(src)].map((s, i) => `${i + 1}. ${s}`).join("\n");
}

/** Assemble a ReportInput from findings - pure, deterministic. Narrative prose is
 * left to the optional LLM layer; without it these stay honest deterministic text. */
export function assembleReportInput(f: ResearchFindings, date: string, runId: string, narrative?: Partial<ReportInput>): ReportInput {
  const confidence = deriveConfidence(f);
  const cluster = f.watchlist?.cluster || f.value;
  const actor = f.watchlist?.attribution || "Undetermined";
  const pivotMembers = f.pivots.reduce((s, p) => s + p.members.length, 0);
  const detSummary =
    `Query “${f.value}” (${f.kind}). ` +
    (f.watchlist ? `Matches the curated cluster ${f.watchlist.cluster} (${f.watchlist.attribution}; reporting: ${f.watchlist.reporting.join(", ")}). ` : "No curated-cluster match. ") +
    (f.crtsh?.members?.length ? `${f.crtsh.members.length} host(s) in CT logs. ` : "") +
    (f.trackers.gaIds.length + f.trackers.adsenseIds.length ? `${f.trackers.gaIds.length + f.trackers.adsenseIds.length} tracker id(s) extracted. ` : "") +
    (pivotMembers ? `${pivotMembers} reverse-lookup member domain(s). ` : "") +
    (f.hostConduct?.matched ? `Documented host conduct on file for ${f.hostConduct.org}. ` : "") +
    (f.deep?.sharedInfra.sameIp.length ? `${f.deep.sharedInfra.sameIp.length} discovered domain(s) on the seed's own non-CDN IP. ` : "") +
    (allDocumentedHits(f).length ? `${allDocumentedHits(f).length} documented-reference hit(s) (state media / campaign / registry). ` : "") +
    (f.deep?.age.recent ? `Site first observed ${f.deep.age.ageDays} days ago (recently stood up). ` : "") +
    (f.coordination?.cib ? `Narrative Coordination Likelihood: ${f.coordination.cib.likelihood}${f.coordination.cib.likelihood === "Strong" ? " - actor UNDETERMINED" : ""}. ` : "") +
    `Association is not shared ownership; a shared selector is a co-behavior lead.`;

  const docHits = allDocumentedHits(f);
  const cibGrade = f.coordination?.cib?.likelihood;
  const evidenceFor = [
    f.watchlist && "curated pattern + cited reporting",
    docHits.length && `${docHits.length} documented-reference hit(s)`,
    f.deep?.sharedInfra.corroborates && "shared non-CDN IP with discovered domains",
    pivotMembers >= 3 && `${pivotMembers} reverse-lookup members`,
    (cibGrade === "Moderate" || cibGrade === "Strong") && `coordination ${cibGrade}`,
  ].filter(Boolean).join("; ");
  const hypothesisRows = [
    f.watchlist
      ? `| H1: ${f.watchlist.cluster} | ${evidenceFor || "pattern match"} | not independently confirmed here | consistent, ${f.watchlist.confidence} |`
      : evidenceFor
        ? `| H1: coordinated network around “${f.value}” (actor UNDETERMINED) | ${evidenceFor} | association ≠ common control | consistent, unconfirmed |`
        : "",
    `| H0 (null): no coordinated operation - organic / unrelated activity | ${evidenceFor ? "shared hosting, trackers and viral copy-paste also occur organically" : "no distinctive shared selector or coordination signal found"} | - | cannot be excluded |`,
    `| H-D (deception): deliberate mimicry or false flag | copied selectors / reused templates can be planted to mislead attribution | no evidence either way in passive OSINT | cannot be excluded |`,
  ].filter(Boolean).join("\n");

  return {
    network_name: f.watchlist?.cluster || f.value,
    date, run_id: runId, mode: "full", seed: f.value, overall_confidence: confidence,
    cluster, assessed_actor: actor,
    narratives_short: narrative?.narratives_short,
    audience_short: narrative?.audience_short,
    breakout_category: "Category 1 (not established)",
    executive_summary: narrative?.executive_summary || detSummary,
    scope: `Automated OSINT collection seeded by the query “${f.value}”. Passive, open-source only.`,
    kiq_list: "- What assets share the seed's selectors/infrastructure?\n- Is the seed part of a documented cluster?\n- What is the confidence in any attribution?",
    tools_live: f.toolsLive.join(", ") || "crt.sh (keyless)",
    tools_not_configured: f.toolsNotConfigured.join(", ") || "none",
    collection_dates: date,
    actor_narrative: narrative?.actor_narrative || (f.watchlist ? `The seed matches ${f.watchlist.cluster}, attributed by public reporting to ${f.watchlist.attribution}.` : "No organization-level attribution is established from the collected data."),
    actor_table_rows: actorRows(f),
    asset_table_rows: assetRows(f),
    infrastructure_narrative: narrative?.infrastructure_narrative || (f.hostConduct?.matched ? `${f.hostConduct.org}: ${f.hostConduct.summary || "documented host conduct on file."} ${f.hostConduct.clientCaveat}` : ""),
    infra_table_rows: infraRows(f),
    underground_findings_or_none: "None - dark-web module did not run.",
    narrative_analysis: narrative?.narrative_analysis || coordinationProse(f),
    disarm_table_rows: "",
    impact_evidence: narrative?.impact_evidence || (f.forecast?.available
      ? `Early-Warning Radar: ${f.forecast.band} - ${f.forecast.estimative} to escalate within ${f.forecast.horizonDays}d (hazard ${Math.round(f.forecast.hazard * 100)}%, ${f.forecast.confidence} confidence). ${f.forecast.alternative}`
      : undefined),
    ach_table_rows: hypothesisRows,
    playbook_comparison: narrative?.playbook_comparison,
    gaps: [
      `Not-connected sources limit coverage: ${[...f.toolsNotConfigured, ...(f.coordination?.sourcesOff || [])].join(", ") || "none"}.`,
      f.coordination?.sourcesFailed.length ? `Sources connected but failing this run: ${f.coordination.sourcesFailed.join(", ")}.` : "",
      f.deep && !f.deep.coHosted.collected ? `Co-hosting not collected (${f.deep.coHosted.skippedReason}).` : "",
      f.deep && !f.deep.documented.referencePopulated ? "Documented-reference datasets (state media / campaigns / registries) are not populated on this deployment - a missing hit is not a clean bill." : "",
      "Paid reverse-lookup/passive-DNS would extend the pivot. This run is passive OSINT only; a gap is not negative evidence.",
    ].filter(Boolean).join(" "),
    next_steps: narrative?.next_steps || `Connect ${f.toolsNotConfigured.slice(0, 3).join(", ") || "additional providers"} to widen the pivot; re-run to diff new nodes; corroborate any attribution against a second independent source.`,
    sources_numbered_with_links: sourcesList(f) || "1. crt.sh (Certificate Transparency)",
  };
}

// --- async collection --------------------------------------------------------

async function collectDomain(value: string, log: string[]): Promise<Partial<ResearchFindings>> {
  const out: Partial<ResearchFindings> = { trackers: { gaIds: [], adsenseIds: [] }, pivots: [], articles: [] };
  // Resolve infrastructure (domain → IP → ASN/org) + RDAP + news, in parallel.
  const [infra, rdap, articles] = await Promise.all([
    resolveDomainInfra(value),
    lookupDomainRdap(value),
    gdeltArticles(value),
  ]);
  out.infra = infra; out.rdap = rdap; out.articles = articles;
  if (infra.asn) {
    log.push(`infra: ${infra.ip} · ${infra.asn}${infra.org ? ` ${infra.org}` : ""}${infra.country ? ` · ${infra.country}` : ""}.`);
    // The #1 gap closed: resolved ASN/operator → documented host conduct.
    const hc = buildHostConduct({ asn: infra.asn, org: infra.org, hostName: infra.org });
    if (hc.matched) { out.hostConduct = hc; log.push(`host-conduct: documented (${hc.org}).`); }
  } else { log.push("infra: could not resolve to an IP/ASN."); }
  if (rdap.registrar || rdap.registrationDate) log.push(`rdap: ${[rdap.registrar, rdap.registrationDate].filter(Boolean).join(", ")}.`);
  if (articles.length) log.push(`news: ${articles.length} recent article(s) (GDELT).`);
  // crt.sh (keyless)
  try {
    const { runPivot: _rp } = await import("./adapters");
    const crt = (await _rp("domain", value)).results.find((r) => r.tool === "crtsh.certs");
    if (crt) { out.crtsh = crt; log.push(`crt.sh: ${crt.members.length} host(s).`); }
  } catch { log.push("crt.sh: query failed."); }
  // homepage tracker extraction → reverse-lookup pivots
  try {
    const html = await getText(`https://${value}`, { timeoutMs: 9000 });
    if (html) {
      const gaIds = [...new Set(extractGaIds(html))].slice(0, 5);
      const adsenseIds = [...new Set(extractAdsenseIds(html))].slice(0, 5);
      out.trackers = { gaIds, adsenseIds };
      log.push(`homepage: ${gaIds.length} GA + ${adsenseIds.length} AdSense id(s).`);
      const pivots: PivotResult[] = [];
      for (const id of adsenseIds) pivots.push(await runPivot("adsense_id", id));
      for (const id of gaIds) pivots.push(await runPivot("ga_id", id));
      out.pivots = pivots;
    } else { log.push("homepage: not reachable."); }
  } catch { log.push("homepage: fetch failed."); }

  // v2 deep pass. Second hop resolves only OTHER registrable domains - the
  // seed's own subdomains share its operator by definition, so they would
  // inflate the shared-IP test without adding evidence.
  const own = (d: string) => d === value || d.endsWith(`.${value}`);
  const pivotDomains = dedupeDomains((out.pivots || []).flatMap((p) => p.members)).filter((d) => !own(d));
  try {
    out.deep = await deepenDomain(value, out.infra, out.rdap, [...pivotDomains, ...(out.crtsh?.members || [])].filter((d) => !own(d)), log);
    const wlHits = watchlistHitsFor([...pivotDomains, ...out.deep.coHosted.domains, ...out.deep.sharedInfra.sameIp], getResolvedRules());
    if (wlHits.length) {
      out.deep.documented.related.push(...wlHits);
      log.push(`curated watchlist: ${wlHits.length} discovered domain(s) match a documented cluster.`);
    }
  } catch { log.push("deep pass: failed (isolated - the rest of the report stands)."); }
  return out;
}

/** Discovered (non-seed) domains that match a curated, cited watchlist cluster. */
export function watchlistHitsFor(domains: string[], rules: ResolvedRule[]): DocumentedHit[] {
  const out: DocumentedHit[] = [];
  for (const d of [...new Set(domains)]) {
    const r = matchWatchlist("domain", d, rules);
    if (r) out.push({ domain: d, kind: "curated-watchlist", label: `${r.cluster} (${r.attribution})`, citation: r.reporting.join(", ") || undefined });
  }
  return out;
}

/** Run the full research pipeline for a query and compile the report + annex. */
export async function runResearch(query: string, now: { date: string; runId: string }): Promise<{ findings: ResearchFindings; report: CompiledReport; annex: ReportAnnex }> {
  const { kind, value } = classifyQuery(query);
  const rules = getResolvedRules();
  const log: string[] = [`Classified query as ${kind}.`];
  const watchlist = matchWatchlist(kind, value, rules);
  if (watchlist) log.push(`Watchlist match: ${watchlist.cluster}.`);

  // Narrative coordination runs alongside the infra collectors (it is the slow,
  // many-source sweep) for a domain - who is pushing this site - or a narrative.
  const coordinationP: Promise<NarrativeCoordination | undefined> = kind === "domain" || kind === "freetext"
    ? collectNarrativeCoordination(value).catch(() => ({ collected: false, mentions: 0, sourcesLive: [], sourcesOff: [], sourcesFailed: [], note: "collection failed" }))
    : Promise.resolve(undefined);

  let partial: Partial<ResearchFindings> = { trackers: { gaIds: [], adsenseIds: [] }, pivots: [], articles: [] };
  if (kind === "domain") partial = await collectDomain(value, log);
  else if (kind === "asn") { partial.hostConduct = buildHostConduct({ asn: value }); log.push(partial.hostConduct.matched ? `host-conduct: documented (${partial.hostConduct.org}).` : "host-conduct: not on file."); }
  else if (kind === "adsense_id" || kind === "ga_id") {
    partial.pivots = [await runPivot(kind, value)];
    log.push(`reverse-lookup pivot on ${kind}.`);
    const hits = documentedMatches(undefined, partial.pivots.flatMap((p) => p.members)).related;
    if (hits.length) { partial.documentedHits = hits; log.push(`documented reference: ${hits.length} hit(s) among pivot members.`); }
  }
  else { partial.articles = await gdeltArticles(value); log.push(`Free-text query: ${partial.articles.length} news article(s) (GDELT) + watchlist/reporting.`); }

  partial.coordination = await coordinationP;
  const c = partial.coordination;
  if (c) {
    log.push(c.collected && c.cib
      ? `coordination: ${c.cib.likelihood}${c.cib.likelihood === "Strong" ? " - actor UNDETERMINED" : ""} over ${c.mentions} public mention(s) from ${c.sourcesLive.length} live source(s).`
      : `coordination: not collected (${c.note}).`);
  }

  // Early-Warning Radar (keyless: public attention + tone) for a domain or a
  // named network - folds an escalation forecast into the report's impact section.
  if (kind === "domain" || kind === "freetext") {
    try {
      const ctx = await collectSignalContext(value);
      const wiki = ctx.signals.find((s) => s.key === "wikipedia");
      const tone = ctx.signals.find((s) => s.key === "gdelt-tone");
      const volume = (wiki?.collected ? wiki.series : []).map((p) => ({ date: p.date, value: p.value }));
      const toneSeries = (tone?.collected ? tone.series : []).map((p) => ({ date: p.date, value: p.value }));
      if (volume.length) {
        partial.forecast = forecastNarrativeRisk({ volume, tone: toneSeries });
        log.push(`radar: ${partial.forecast.band} (hazard ${Math.round(partial.forecast.hazard * 100)}%).`);
      } else { log.push("radar: no public attention series for this query."); }
    } catch { log.push("radar: forecast unavailable."); }
  }

  // Tool coverage across everything that ran.
  const toolsLive = new Set<string>(["crtsh.certs"]);
  const toolsNotConfigured = new Set<string>();
  for (const p of partial.pivots || []) { p.connectedTools.forEach((t) => toolsLive.add(t)); p.notConnectedTools.forEach((t) => toolsNotConfigured.add(t)); }

  if (partial.forecast) toolsLive.add("early-warning-radar");
  if (partial.deep?.sharedInfra.collected) toolsLive.add("second-hop-dns");
  if (partial.deep?.age.firstSeen) toolsLive.add("wayback-cdx");
  if (partial.deep?.coHosted.collected) toolsLive.add("reverse-ip");
  if (partial.deep?.documented.referencePopulated) toolsLive.add("io-reference");
  if (c?.collected) toolsLive.add(`cib-coordination (${c.sourcesLive.length} sources)`);
  for (const s of c?.sourcesOff || []) toolsNotConfigured.add(`mentions:${s}`);

  const findings: ResearchFindings = {
    kind, value, watchlist,
    crtsh: partial.crtsh,
    trackers: partial.trackers || { gaIds: [], adsenseIds: [] },
    pivots: partial.pivots || [],
    hostConduct: partial.hostConduct,
    forecast: partial.forecast,
    infra: partial.infra,
    rdap: partial.rdap,
    articles: partial.articles || [],
    deep: partial.deep,
    documentedHits: partial.documentedHits,
    coordination: partial.coordination,
    toolsLive: [...toolsLive], toolsNotConfigured: [...toolsNotConfigured], log,
  };

  // Deterministic report first; then optional LLM prose for the narrative
  // sections only (never the scores/attribution). Honest fallback without a key.
  const confidence = deriveConfidence(findings);
  const narrative = await narrateResearch(findings, confidence);
  if (Object.keys(narrative).length) log.push("narrative: synthesized by the LLM (facts + confidence fixed in code).");
  const input = assembleReportInput(findings, now.date, now.runId, narrative);
  const annex = buildAnnex(findings, rules);
  return { findings, report: compileReport(input), annex };
}

/**
 * Brief mode - paste a full investigation brief; extract every hard selector
 * (AdSense/GA/ASN/domains), run each through its collector, and merge ONE report.
 * Domains are capped to bound wall-clock; everything degrades honestly.
 */
export async function runBriefResearch(brief: string, now: { date: string; runId: string }): Promise<{ findings: ResearchFindings; report: CompiledReport; annex: ReportAnnex; selectors: Selectors }> {
  const sel = extractSelectors(brief);
  const rules = getResolvedRules();
  const log: string[] = [`Brief: extracted ${sel.adsense.length} AdSense, ${sel.ga.length} GA, ${sel.asn.length} ASN, ${sel.domains.length} domain(s).`];

  // Watchlist: first match across any selector.
  let watchlist: ResolvedRule | null = null;
  for (const a of sel.adsense) { if ((watchlist = matchWatchlist("adsense_id", a, rules))) break; }
  if (!watchlist) for (const a of sel.asn) { if ((watchlist = matchWatchlist("asn", a, rules))) break; }
  if (!watchlist) for (const d of sel.domains) { if ((watchlist = matchWatchlist("domain", d, rules))) break; }
  if (watchlist) log.push(`Watchlist match: ${watchlist.cluster}.`);

  // Reverse-lookup pivots on every tracker selector (parallel).
  const pivots = (await Promise.all([
    ...sel.adsense.map((a) => runPivot("adsense_id", a)),
    ...sel.ga.map((g) => runPivot("ga_id", g)),
  ])).filter(Boolean);

  // Per-domain infra + host-conduct + crt.sh (capped to 4 to bound time), in
  // parallel - one slow domain no longer stalls the others.
  let infra: any, rdap: any, hostConduct: any;
  const crtMembers: string[] = [];
  const perDomain = await Promise.all(sel.domains.slice(0, 4).map(async (d) => {
    const [di, piv] = await Promise.all([
      resolveDomainInfra(d).catch(() => ({} as DomainInfra)),
      runPivot("domain", d).catch(() => null),
    ]);
    return { di, crt: piv?.results.find((r) => r.tool === "crtsh.certs") };
  }));
  for (const { di, crt } of perDomain) {
    if (!infra && di.ip) infra = di;
    if (di.asn && !hostConduct) { const hc = buildHostConduct({ asn: di.asn, org: di.org, hostName: di.org }); if (hc.matched) hostConduct = hc; }
    if (crt) crtMembers.push(...crt.members);
  }
  // ASN selectors → documented host conduct.
  for (const a of sel.asn) { if (!hostConduct) { const hc = buildHostConduct({ asn: a }); if (hc.matched) { hostConduct = hc; log.push(`host-conduct: documented (${hc.org}).`); } } }
  if (sel.domains[0]) rdap = await lookupDomainRdap(sel.domains[0]);
  const articles = await gdeltArticles(briefTitle(brief));
  log.push(`Pivots: ${pivots.length}; crt.sh hosts: ${crtMembers.length}; news: ${articles.length}.`);

  // Documented-reference match across every brief domain + pivot member (pure).
  const doc = documentedMatches(undefined, [...sel.domains, ...pivots.flatMap((p) => p.members)]);
  if (doc.related.length) log.push(`documented reference: ${doc.related.length} hit(s) across brief domains + pivot members.`);

  const toolsLive = new Set<string>(["crtsh.certs"]);
  const toolsNotConfigured = new Set<string>();
  for (const p of pivots) { p.connectedTools.forEach((t) => toolsLive.add(t)); p.notConnectedTools.forEach((t) => toolsNotConfigured.add(t)); }
  if (doc.referencePopulated) toolsLive.add("io-reference");

  const findings: ResearchFindings = {
    kind: "freetext", value: briefTitle(brief), watchlist,
    crtsh: crtMembers.length ? { tool: "crtsh.certs", connected: true, members: dedupeDomains(crtMembers), count: crtMembers.length, note: `crt.sh: ${crtMembers.length} host(s) across brief domains.` } : undefined,
    trackers: { gaIds: sel.ga, adsenseIds: sel.adsense },
    pivots, hostConduct, infra, rdap, articles,
    documentedHits: doc.related.length ? doc.related : undefined,
    toolsLive: [...toolsLive], toolsNotConfigured: [...toolsNotConfigured], log,
  };
  const confidence = deriveConfidence(findings);
  const narrative = await narrateResearch(findings, confidence);
  const input = assembleReportInput(findings, now.date, now.runId, narrative);
  const annex = buildAnnex(findings, rules);
  return { findings, report: compileReport(input), annex, selectors: sel };
}
