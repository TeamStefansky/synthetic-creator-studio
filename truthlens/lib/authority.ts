// Authority / longevity assessment - legitimacy signals that DON'T depend on
// the seed list, so established outlets are recognized automatically:
//   - domain age (RDAP)
//   - web longevity (years since first Wayback snapshot + snapshot volume)
//   - optional domain authority via Open PageRank (free API; OPENPAGERANK_KEY)
// A long-lived, heavily-archived, high-authority domain is strong evidence of a
// real, established site.

import { getJson, fetchWithTimeout } from "./http";
import { cacheGet, cacheSet } from "./cache";
import type { AuthorityInfo, DomainInfo, ArchiveInfo } from "./types";

// Open PageRank (DomCop / Keywords Everywhere). New bulk endpoint uses Bearer
// auth + a POST body of domains (with optional history); the legacy endpoint uses
// an API-OPR header + GET. We try bulk first and fall back to legacy so an old
// key/endpoint still works. OPENPAGERANK_KEY holds the token for both.
const OPR_BULK = "https://openpagerank.keywordseverywhere.com/v1/domains/bulk";
const OPR_LEGACY = "https://openpagerank.com/api/v1.0/getPageRank";

export interface OprResult { rank?: number; position?: number; history?: { date?: string; rank?: number }[] }

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}
function normDomain(d: string): string {
  return d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();
}
// Defensive: field names vary across API versions, so probe the likely ones.
function parseRow(row: any): OprResult | undefined {
  if (!row || typeof row !== "object") return undefined;
  const rank = num(row.page_rank_decimal ?? row.page_rank ?? row.pagerank ?? row.pr ?? row.rank_decimal);
  const position = num(row.rank ?? row.global_rank ?? row.position ?? row.rank_integer);
  const history = Array.isArray(row.history)
    ? row.history.map((h: any) => ({ date: h?.date ?? h?.updated_at ?? h?.month, rank: num(h?.page_rank_decimal ?? h?.page_rank ?? h?.rank) }))
        .filter((h: any) => h.rank != null)
    : undefined;
  if (rank == null && position == null) return undefined;
  return { rank, position, history: history && history.length ? history : undefined };
}
function rowsOf(data: any): any[] {
  const arr = data?.response ?? data?.data ?? data?.domains ?? data?.result ?? data?.results;
  return Array.isArray(arr) ? arr : [];
}

/** Bulk Open PageRank (0-10 authority + optional history) for many domains at
 *  once. Empty map without a key. Tries the new bulk endpoint, then legacy. */
export async function fetchOpenPageRankBulk(domains: string[], includeHistory = false): Promise<Map<string, OprResult>> {
  const out = new Map<string, OprResult>();
  const key = process.env.OPENPAGERANK_KEY;
  const uniq = [...new Set(domains.map(normDomain).filter(Boolean))].slice(0, 100);
  if (!key || !uniq.length) return out;

  // 1. new bulk endpoint (Bearer + POST)
  try {
    const res = await fetchWithTimeout(OPR_BULK, {
      method: "POST", timeoutMs: 9000,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ domains: uniq, include_history: includeHistory }),
    });
    if (res.ok) {
      for (const row of rowsOf(await res.json().catch(() => null))) {
        const d = normDomain(String(row?.domain || row?.url || ""));
        const parsed = parseRow(row);
        if (d && parsed) out.set(d, parsed);
      }
    }
  } catch { /* fall through to legacy */ }

  // 2. legacy fallback (API-OPR header + GET) for anything still unresolved
  const missing = uniq.filter((d) => !out.has(d));
  if (missing.length) {
    try {
      const qs = missing.map((d) => `domains[]=${encodeURIComponent(d)}`).join("&");
      const data = await getJson<any>(`${OPR_LEGACY}?${qs}`, { headers: { "API-OPR": key } });
      for (const row of (data?.response || [])) {
        if (row?.status_code !== 200) continue;
        const d = normDomain(String(row.domain || ""));
        const parsed = parseRow(row);
        if (d && parsed) out.set(d, parsed);
      }
    } catch { /* ignore */ }
  }
  return out;
}

/** Open PageRank for a single domain (via the bulk adapter). */
async function fetchOpenPageRank(domain: string): Promise<OprResult | undefined> {
  const map = await fetchOpenPageRankBulk([domain], false);
  return map.get(normDomain(domain));
}

function yearsSince(iso?: string): number | undefined {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return undefined;
  return (Date.now() - t) / (365.25 * 86400000);
}

export async function assessAuthority(
  domain: string,
  dom?: DomainInfo,
  archive?: ArchiveInfo,
): Promise<AuthorityInfo> {
  const cached = await cacheGet<AuthorityInfo>(`authority:${domain}`);
  if (cached) return cached;

  const domainAgeYears =
    dom?.ageDays != null ? Math.round((dom.ageDays / 365.25) * 10) / 10 : undefined;
  const waybackYearsRaw = yearsSince(archive?.firstSeen);
  const waybackYears = waybackYearsRaw != null ? Math.round(waybackYearsRaw * 10) / 10 : undefined;
  const snapshotCount = archive?.snapshotCount || 0;

  const opr = await fetchOpenPageRank(domain);

  // Derive an overall authority level from whatever signals are available.
  const ageYears = Math.max(domainAgeYears ?? 0, waybackYears ?? 0);
  let level: AuthorityInfo["level"] = "unknown";
  const haveAny = domainAgeYears != null || waybackYears != null || opr?.rank != null;
  if (haveAny) {
    const strong =
      ageYears >= 10 || snapshotCount >= 1000 || (opr?.rank != null && opr.rank >= 6);
    const medium =
      ageYears >= 4 || snapshotCount >= 200 || (opr?.rank != null && opr.rank >= 4);
    level = strong ? "high" : medium ? "medium" : "low";
  }

  const info: AuthorityInfo = {
    domainAgeYears,
    waybackYears,
    snapshotCount,
    openPageRank: opr?.rank,
    globalRank: opr?.position,
    level,
  };

  await cacheSet(`authority:${domain}`, info);
  return info;
}
