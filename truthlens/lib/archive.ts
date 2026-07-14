// Wayback Machine history via the CDX API.
// Derives first-seen date and a snapshot count (a proxy for site longevity).

import { getJson } from "./httpClient";
import type { ArchiveInfo } from "./types";

// CDX returns an array-of-arrays; first row is the header.
type CdxRow = string[];

export async function lookupArchive(domain: string): Promise<ArchiveInfo | null> {
  const url =
    `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}` +
    `&output=json&limit=50&fl=timestamp&collapse=timestamp:6`;
  const rows = await getJson<CdxRow[]>(url);
  if (!rows || rows.length <= 1) {
    return { firstSeen: null, snapshotCount: 0 };
  }

  // Drop header row.
  const data = rows.slice(1);
  // timestamp format: YYYYMMDDhhmmss
  const timestamps = data
    .map((r) => r[0])
    .filter((t) => /^\d{14}$/.test(t))
    .sort();

  const first = timestamps[0];
  const firstSeen = first
    ? new Date(
        `${first.slice(0, 4)}-${first.slice(4, 6)}-${first.slice(6, 8)}T00:00:00Z`
      ).toISOString()
    : null;

  return { firstSeen, snapshotCount: timestamps.length };
}
