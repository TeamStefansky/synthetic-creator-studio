// Part II - Collection Annex. The working annex a researcher uses to CONTINUE
// the investigation (the FIMI-dossier structure): quotable primary sources,
// ready-to-run watchlist monitor rules, a scoping RFI for the paid providers
// that would extend coverage, and the cyber<->IO co-residence test. Pure +
// deterministic; assembled from what was actually collected. Honest about gaps.

import type { ResolvedRule } from "./watchlist";
import type { ResearchFindings } from "./research";

export interface PrimarySource { label: string; url?: string; date?: string; kind: "news" | "reporting" | "record" }
export interface ProviderAsk { provider: string; envVar: string; wouldAdd: string; status: "connected" | "not connected" }
export interface ReportAnnex {
  primarySources: PrimarySource[];
  watchlistRules: { id: string; cluster: string; confidence: string; tools: string[]; coverage: string; match: Record<string, unknown> }[];
  providerRfi: ProviderAsk[];
  coResidence: { tested: boolean; result: string };
  markdown: string;
}

const PAID_PROVIDERS: { provider: string; envVar: string; wouldAdd: string }[] = [
  { provider: "PublicWWW", envVar: "PUBLICWWW_API_KEY", wouldAdd: "reverse source-code / shared tracker & ad-id search (network expansion)" },
  { provider: "SpyOnWeb", envVar: "SPYONWEB_API_KEY", wouldAdd: "reverse analytics/AdSense id → sibling domains" },
  { provider: "DNSlytics", envVar: "DNSLYTICS_API_KEY", wouldAdd: "reverse-analytics corroboration" },
  { provider: "urlscan.io", envVar: "URLSCAN_API_KEY", wouldAdd: "live subdomains + page screenshots + tech fingerprints" },
  { provider: "SecurityTrails", envVar: "SECURITYTRAILS_API_KEY", wouldAdd: "passive-DNS history, reverse-WHOIS, subdomain enumeration" },
  { provider: "DomainTools Iris", envVar: "DOMAINTOOLS_API_KEY", wouldAdd: "reverse-IP co-tenancy, pivot enrichment (enterprise)" },
  { provider: "Recorded Future", envVar: "RECORDEDFUTURE_API_KEY", wouldAdd: "curated APT-infra IOC corpus for the co-residence test (enterprise)" },
];

export function buildAnnex(f: ResearchFindings, rules: ResolvedRule[], env: NodeJS.ProcessEnv = process.env): ReportAnnex {
  // Primary sources: collected news + cited reporting + documented records.
  const primarySources: PrimarySource[] = [];
  for (const a of f.articles.slice(0, 12)) primarySources.push({ label: a.title || a.domain, url: a.url, date: a.date, kind: "news" });
  for (const r of f.watchlist?.reporting || []) primarySources.push({ label: r, kind: "reporting" });
  for (const fi of f.hostConduct?.findings || []) for (const s of fi.sources) primarySources.push({ label: s, kind: "record" });

  // Watchlist rules relevant to continue monitoring (matched first, else all).
  const relevant = f.watchlist ? [f.watchlist] : rules;
  const watchlistRules = relevant.map((r) => ({ id: r.id, cluster: r.cluster, confidence: r.confidence, tools: r.tools, coverage: r.coverage, match: r.match }));

  // Provider RFI: what to connect next and what each unlocks (honest status).
  const providerRfi: ProviderAsk[] = PAID_PROVIDERS.map((p) => ({ ...p, status: env[p.envVar] ? "connected" : "not connected" }));

  // Co-residence test (cyber↔IO): needs an APT-infra IOC corpus we do not have
  // open-source → honest insufficient-data, never a fake clean negative.
  const coResidence = {
    tested: false,
    result: `Not run - the cyber↔IO co-residence test requires a maintained APT-infra IOC corpus (Recorded Future / DomainTools), which is ${env.RECORDEDFUTURE_API_KEY || env.DOMAINTOOLS_API_KEY ? "configured" : "not configured"}. Absent it, this is INSUFFICIENT DATA, not a clean negative.`,
  };

  const md = [
    "## Part II - Collection Annex",
    "",
    "### Primary sources",
    primarySources.length ? primarySources.map((s, i) => `${i + 1}. [${s.kind}] ${s.label}${s.url ? ` - ${s.url}` : ""}${s.date ? ` (${s.date})` : ""}`).join("\n") : "_None collected._",
    "",
    "### Ready-to-run monitor rules",
    watchlistRules.map((r) => `- **${r.cluster}** (${r.confidence}) - tools: ${r.tools.join(", ")} - ${r.coverage}`).join("\n") || "_None._",
    "",
    "### Provider RFI (connect to extend coverage)",
    providerRfi.map((p) => `- ${p.status === "connected" ? "[x]" : "[ ]"} **${p.provider}** (\`${p.envVar}\`) - ${p.wouldAdd}`).join("\n"),
    "",
    "### Cyber↔IO co-residence test",
    coResidence.result,
  ].join("\n");

  return { primarySources, watchlistRules, providerRfi, coResidence, markdown: md };
}
