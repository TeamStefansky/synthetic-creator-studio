// Wayback Machine CDX history: first-seen date + snapshot count. Plus evidence
// preservation via Save Page Now (below), so a report's evidence is captured before
// posts change or vanish.

import { getJson, fetchWithTimeout } from "./http";
import { cacheGet, cacheSet } from "./cache";
import type { ArchiveInfo } from "./types";
import type { ArchiveLink } from "./narrative/types";

export async function lookupArchive(domain: string): Promise<ArchiveInfo> {
  // CDX returns an array of rows; first row is the header.
  const data = await getJson<string[][]>(
    `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(
      domain,
    )}*&output=json&limit=50&fl=timestamp&collapse=timestamp:8`,
    { timeoutMs: 10000 },
  );

  if (!data || data.length <= 1) {
    return { snapshotCount: 0 };
  }

  const rows = data.slice(1); // drop header
  const timestamps = rows.map((r) => r[0]).filter(Boolean).sort();
  const first = timestamps[0];

  let firstSeen: string | undefined;
  if (first && first.length >= 8) {
    // YYYYMMDDhhmmss -> ISO date
    firstSeen = `${first.slice(0, 4)}-${first.slice(4, 6)}-${first.slice(6, 8)}`;
  }

  return { firstSeen, snapshotCount: rows.length };
}

// ---- Evidence preservation (Save Page Now) -----------------------------------
// Fire-and-forget: we trigger a capture and then confirm via the availability API.
// Cached per URL for a day so a report is reproducible and we stay polite to the
// Internet Archive. Capped so a single scan never fans out unboundedly.

const ARCHIVE_CAP = 10;
const ARCHIVE_TTL = 24 * 60 * 60 * 1000; // ~per-day cache

async function availableSnapshot(url: string): Promise<{ archiveUrl: string; timestamp?: string } | null> {
  const data = await getJson<any>(
    `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
    { timeoutMs: 8000 },
  );
  const snap = data?.archived_snapshots?.closest;
  if (snap?.available && snap.url) {
    return { archiveUrl: String(snap.url).replace(/^http:/, "https:"), timestamp: snap.timestamp };
  }
  return null;
}

/** Trigger Save Page Now for one URL and return a link. `archived` when a snapshot
 * is confirmed available; `requested` when we only triggered the save (honest — we
 * never claim a snapshot that may not exist yet). Cached per URL per day. */
export async function saveToArchive(url: string): Promise<ArchiveLink | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  const ck = `spn:${url}`;
  const cached = await cacheGet<ArchiveLink>(ck, ARCHIVE_TTL);
  if (cached) return cached;

  // Fire Save Page Now; do not block on completion.
  try {
    await fetchWithTimeout(`https://web.archive.org/save/${url}`, { timeoutMs: 8000 });
  } catch {
    /* fire-and-forget — failure here never aborts the report */
  }

  const avail = await availableSnapshot(url).catch(() => null);
  const link: ArchiveLink = avail
    ? { url, archiveUrl: avail.archiveUrl, status: "archived", timestamp: avail.timestamp }
    : { url, archiveUrl: `https://web.archive.org/web/*/${url}`, status: "requested" };
  await cacheSet(ck, link);
  return link;
}

/** Preserve up to `cap` unique evidence URLs. Failure-isolated: one failed save
 * never aborts the batch. */
export async function archiveEvidence(
  urls: (string | undefined)[],
  cap = ARCHIVE_CAP,
): Promise<ArchiveLink[]> {
  const uniq = [...new Set(urls.filter((u): u is string => !!u && /^https?:\/\//i.test(u)))].slice(0, cap);
  const links = await Promise.all(uniq.map((u) => saveToArchive(u).catch(() => null)));
  return links.filter((l): l is ArchiveLink => !!l);
}
