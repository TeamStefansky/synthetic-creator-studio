// Authority / longevity assessment — legitimacy signals that DON'T depend on
// the seed list, so established outlets are recognized automatically:
//   - domain age (RDAP)
//   - web longevity (years since first Wayback snapshot + snapshot volume)
//   - optional domain authority via Open PageRank (free API; OPENPAGERANK_KEY)
// A long-lived, heavily-archived, high-authority domain is strong evidence of a
// real, established site.

import { getJson } from "./http";
import { cacheGet, cacheSet } from "./cache";
import type { AuthorityInfo, DomainInfo, ArchiveInfo } from "./types";

interface OprResponse {
  response?: {
    domain: string;
    page_rank_decimal?: number | string;
    rank?: string | number | null;
    status_code?: number;
  }[];
}

/** Open PageRank: 0-10 domain authority. Returns undefined without a key. */
async function fetchOpenPageRank(
  domain: string,
): Promise<{ rank?: number; position?: number } | undefined> {
  const key = process.env.OPENPAGERANK_KEY;
  if (!key) return undefined;
  const data = await getJson<OprResponse>(
    `https://openpagerank.com/api/v1.0/getPageRank?domains[]=${encodeURIComponent(domain)}`,
    { headers: { "API-OPR": key } },
  );
  const row = data?.response?.[0];
  if (!row || row.status_code !== 200) return undefined;
  const rank = row.page_rank_decimal != null ? Number(row.page_rank_decimal) : undefined;
  const position = row.rank != null ? Number(row.rank) : undefined;
  return {
    rank: rank != null && !Number.isNaN(rank) ? rank : undefined,
    position: position != null && !Number.isNaN(position) ? position : undefined,
  };
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
