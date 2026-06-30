// Wayback Machine CDX history: first-seen date + snapshot count.

import { getJson } from "./http";
import type { ArchiveInfo } from "./types";

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
