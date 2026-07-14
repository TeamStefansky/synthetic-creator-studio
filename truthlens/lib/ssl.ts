// SSL certificate transparency data via crt.sh.
// Extracts issuer, validity window and the full de-duplicated SAN domain set,
// which is the basis for finding "sibling" domains on the same certificate.

import { getJson } from "./httpClient";
import type { SslInfo } from "./types";

interface CrtShEntry {
  issuer_name: string;
  name_value: string; // newline-separated list of names on the cert
  not_before: string;
  not_after: string;
  common_name?: string;
}

/** Clean a cert issuer DN down to the organization (O=...) when possible. */
function issuerOrg(dn: string): string {
  const m = dn.match(/O=([^,]+)/);
  return (m ? m[1] : dn).trim();
}

export async function lookupSsl(
  domain: string,
  hasValidHttps: boolean
): Promise<SslInfo | null> {
  // %25 = url-encoded '%' wildcard, matching subdomains too.
  const url = `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`;
  const entries = await getJson<CrtShEntry[]>(url);

  if (!entries || entries.length === 0) {
    return {
      issuer: null,
      validFrom: null,
      validTo: null,
      sanDomains: [],
      certCount: 0,
      validHttps: hasValidHttps,
    };
  }

  // Sort newest-first so the "current" cert is the one we surface.
  const sorted = [...entries].sort(
    (a, b) => new Date(b.not_before).getTime() - new Date(a.not_before).getTime()
  );
  const latest = sorted[0];

  const sanSet = new Set<string>();
  for (const e of entries) {
    for (const name of e.name_value.split(/\n+/)) {
      const n = name.trim().toLowerCase().replace(/^\*\./, "");
      if (n && n.includes(".") && !n.includes(" ")) sanSet.add(n);
    }
  }

  return {
    issuer: issuerOrg(latest.issuer_name),
    validFrom: new Date(latest.not_before).toISOString(),
    validTo: new Date(latest.not_after).toISOString(),
    sanDomains: Array.from(sanSet).sort(),
    certCount: entries.length,
    validHttps: hasValidHttps,
  };
}
