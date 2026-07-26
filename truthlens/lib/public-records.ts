// Public-record officer disclosure (owner-authorized CLAUDE.md exception). Surfaces
// named individuals ONLY when an official public registry has already published
// them — company/nonprofit officer filings — always WITH a citation, labeled as
// disclosure, never inferred, never de-anonymized, never the system's own verdict,
// and never a node in any graph. This is lawful public-record context (like a
// sanctions designation), not attribution.
//
// Source: OpenCorporates (official company registers, worldwide). Key-gated
// (OPENCORPORATES_API_KEY); without a key it renders honestly as "not connected".

import { getJson } from "@/lib/http";

export const PUBLIC_RECORDS_VERSION = "public-records-v1";

export interface PublicOfficer {
  name: string;        // exactly as published in the official record
  role?: string;       // director / secretary / etc. as filed
  org: string;         // the organization the record is filed under
  jurisdiction?: string;
  source: string;      // registry / provider
  sourceUrl?: string;  // citation — required for the name to render
  asOf?: string;
}

export interface PublicRecordsResult {
  connected: boolean;
  reason?: string;
  query: string;
  officers: PublicOfficer[];
  note: string;
}

const UA = "TruthLens/0.1 (public-record officer disclosure)";

export async function lookupPublicOfficers(orgName: string): Promise<PublicRecordsResult> {
  const query = (orgName || "").trim();
  const base: PublicRecordsResult = {
    connected: false, query, officers: [],
    note: "Names below (if any) are disclosed in an official public registry and cited — public-record disclosure, not attribution, inference, or a verdict.",
  };
  if (query.length < 2) return { ...base, reason: "no organization name to look up" };

  const key = process.env.OPENCORPORATES_API_KEY;
  if (!key) return { ...base, reason: "Set OPENCORPORATES_API_KEY (opencorporates.com) to disclose officers from official company registers." };

  try {
    // 1) find the best-matching company in an official register.
    const search = await getJson<any>(
      `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(query)}&per_page=1&api_token=${encodeURIComponent(key)}`,
      { timeoutMs: 12000, headers: { "User-Agent": UA } },
    );
    const co = search?.results?.companies?.[0]?.company;
    if (!co?.jurisdiction_code || !co?.company_number) {
      return { ...base, connected: true, note: `No official company register match for "${query}". A clean result is common and does not certify the operator.` };
    }
    // 2) read that company's filed officers.
    const detail = await getJson<any>(
      `https://api.opencorporates.com/v0.4/companies/${encodeURIComponent(co.jurisdiction_code)}/${encodeURIComponent(co.company_number)}?api_token=${encodeURIComponent(key)}`,
      { timeoutMs: 12000, headers: { "User-Agent": UA } },
    );
    const rawOfficers: any[] = detail?.results?.company?.officers || [];
    const officers: PublicOfficer[] = rawOfficers
      .map((o) => o?.officer)
      .filter((o) => o?.name)
      .slice(0, 25)
      .map((o): PublicOfficer => ({
        name: String(o.name),
        role: o.position || undefined,
        org: co.name || query,
        jurisdiction: co.jurisdiction_code,
        source: "OpenCorporates (official company register)",
        sourceUrl: o.opencorporates_url || co.opencorporates_url,
        asOf: o.start_date || undefined,
      }))
      .filter((o) => !!o.sourceUrl); // a name renders ONLY with a citation

    return {
      ...base, connected: true, officers,
      note: officers.length
        ? "Officers below are as filed in the official company register, each cited — public-record disclosure, not attribution or a verdict. Confirm the record refers to this operator."
        : `Register matched "${co.name}" but disclosed no officers. Public-record disclosure only; never inferred.`,
    };
  } catch (e: any) {
    return { ...base, reason: e?.message || "public-record lookup failed" };
  }
}
