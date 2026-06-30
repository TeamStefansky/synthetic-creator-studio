// SSL certificate history + SAN extraction via crt.sh.
// SAN domains reveal "sibling" sites issued on the same certificate.

import { getJson } from "./http";
import type { SslInfo } from "./types";

interface CrtShEntry {
  issuer_name?: string;
  name_value?: string; // newline-separated domains
  not_before?: string;
  not_after?: string;
}

export async function lookupSsl(domain: string): Promise<SslInfo> {
  const data = await getJson<CrtShEntry[]>(
    `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`,
    { timeoutMs: 12000 },
  );

  if (!data || !Array.isArray(data) || data.length === 0) {
    return { sanDomains: [], certCount: 0 };
  }

  // Most recent first.
  const sorted = [...data].sort((a, b) =>
    (b.not_before || "").localeCompare(a.not_before || ""),
  );
  const latest = sorted[0];

  const sanSet = new Set<string>();
  for (const entry of data) {
    for (const name of (entry.name_value || "").split(/\n/)) {
      const d = name.trim().toLowerCase().replace(/^\*\./, "");
      if (d && d !== domain && d.includes(".")) sanSet.add(d);
    }
  }

  return {
    issuer: latest.issuer_name,
    validFrom: latest.not_before,
    validTo: latest.not_after,
    sanDomains: Array.from(sanSet).slice(0, 100),
    certCount: data.length,
  };
}
