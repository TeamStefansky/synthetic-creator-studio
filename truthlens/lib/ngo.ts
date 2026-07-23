// Nonprofit / NGO public-data lookup for the OSINT toolset. Organizations only -
// registration IDs, category, status and financials taken from PUBLIC regulatory
// filings (IRS Form 990, charity registers). Never trustee/officer person records
// (CLAUDE.md rule 1 + "organizations only; no person records"). Official public
// endpoints only; a source without its key renders "not connected", never faked.
// Failure of one source never aborts the batch.
//
// Sources:
//   - ProPublica Nonprofit Explorer (US IRS 990) - keyless, public.
//   - UK Charity Commission Register - official API, needs CHARITY_COMMISSION_KEY.

import { getJson } from "@/lib/http";
import type { SourceStatus } from "./narrative/types";

export interface NgoRecord {
  source: string;
  id: string;
  name: string;
  country: string;         // ISO-ish / display
  /** Registration identifier (EIN, charity number, …). */
  registrationId?: string;
  /** Legal/tax classification, e.g. "501(c)(3)". */
  classification?: string;
  category?: string;       // human category (from NTEE etc.)
  city?: string;
  region?: string;         // state / region
  status?: string;         // e.g. "Registered", "Removed"
  /** Latest reported figures from a public filing (USD/GBP as filed). */
  revenue?: number;
  expenses?: number;
  assets?: number;
  fiscalYear?: number;
  currency?: string;
  /** Link to the public filing / register entry. */
  url?: string;
}

export interface NgoResult {
  status: SourceStatus;
  records: NgoRecord[];
}

const UA = "TruthLens/0.1 (nonprofit public-registry lookup)";

// NTEE major-group (first letter) -> human category. Organization classification
// only; no judgement attached.
const NTEE_CATEGORY: Record<string, string> = {
  A: "Arts & culture", B: "Education", C: "Environment", D: "Animals",
  E: "Health", F: "Mental health", G: "Disease/medical", H: "Medical research",
  I: "Crime & legal", J: "Employment", K: "Food & agriculture", L: "Housing",
  M: "Public safety/disaster", N: "Recreation & sports", O: "Youth development",
  P: "Human services", Q: "International/foreign affairs", R: "Civil rights & advocacy",
  S: "Community development", T: "Philanthropy & grantmaking", U: "Science & tech",
  V: "Social science", W: "Public benefit", X: "Religion", Y: "Mutual benefit",
  Z: "Unknown",
};

function nteeCategory(code?: string): string | undefined {
  const c = (code || "").trim().toUpperCase();
  return c ? NTEE_CATEGORY[c[0]] : undefined;
}

interface NgoSource {
  name: string;
  available(): boolean;
  reason?: string;
  search(query: string): Promise<NgoRecord[]>;
}

// ---- ProPublica Nonprofit Explorer (US IRS Form 990) - keyless --------------

const ENRICH_CAP = 6; // enrich the top N results with latest-filing financials

async function propublicaFinancials(ein: string): Promise<Partial<NgoRecord>> {
  try {
    const url = `https://projects.propublica.org/nonprofits/api/v2/organizations/${ein}.json`;
    const data = await getJson<any>(url, { timeoutMs: 12000, headers: { "User-Agent": UA } });
    const f = (data?.filings_with_data || [])[0];
    if (!f) return {};
    return {
      revenue: typeof f.totrevenue === "number" ? f.totrevenue : undefined,
      expenses: typeof f.totfuncexpns === "number" ? f.totfuncexpns : undefined,
      assets: typeof f.totassetsend === "number" ? f.totassetsend : undefined,
      fiscalYear: f.tax_prd_yr,
      currency: "USD",
    };
  } catch {
    return {};
  }
}

const propublica: NgoSource = {
  name: "propublica",
  available: () => true,
  async search(q) {
    const url = `https://projects.propublica.org/nonprofits/api/v2/search.json?q=${encodeURIComponent(q)}`;
    const data = await getJson<any>(url, { timeoutMs: 15000, headers: { "User-Agent": UA } });
    const orgs: any[] = (data?.organizations || []).slice(0, 25);
    const records: NgoRecord[] = orgs.map((o): NgoRecord => ({
      source: "propublica",
      id: `propublica:${o.ein}`,
      name: o.name || o.sub_name || "(unnamed)",
      country: "US",
      registrationId: o.strein || String(o.ein),
      classification: o.subseccd ? `501(c)(${o.subseccd})` : undefined,
      category: nteeCategory(o.ntee_code || o.raw_ntee_code),
      city: o.city,
      region: o.state,
      url: `https://projects.propublica.org/nonprofits/organizations/${o.ein}`,
    }));
    // Enrich the top results with the latest public filing's headline figures.
    await Promise.all(
      records.slice(0, ENRICH_CAP).map(async (r, i) => {
        const ein = orgs[i]?.ein;
        if (ein) Object.assign(r, await propublicaFinancials(String(ein)));
      }),
    );
    return records;
  },
};

// ---- UK Charity Commission Register - official API, key-gated ---------------

const charityCommission: NgoSource = {
  name: "charity-commission",
  available: () => !!process.env.CHARITY_COMMISSION_KEY,
  reason: "Set CHARITY_COMMISSION_KEY (free at register.charitycommission.gov.uk / API portal).",
  async search(q) {
    const key = process.env.CHARITY_COMMISSION_KEY!;
    const url = `https://api.charitycommission.gov.uk/register/api/searchCharityName/${encodeURIComponent(q)}`;
    const data = await getJson<any>(url, {
      timeoutMs: 15000,
      headers: { "User-Agent": UA, "Ocp-Apim-Subscription-Key": key, Accept: "application/json" },
    });
    const rows: any[] = Array.isArray(data) ? data.slice(0, 25) : [];
    return rows.map((c): NgoRecord => ({
      source: "charity-commission",
      id: `uk-cc:${c.reg_charity_number || c.organisation_number}`,
      name: c.charity_name || "(unnamed)",
      country: "GB",
      registrationId: String(c.reg_charity_number ?? c.organisation_number ?? ""),
      status: c.reg_status === "R" ? "Registered" : c.reg_status,
      revenue: typeof c.latest_income === "number" ? c.latest_income : undefined,
      expenses: typeof c.latest_expenditure === "number" ? c.latest_expenditure : undefined,
      currency: "GBP",
      url: c.reg_charity_number
        ? `https://register-of-charities.charitycommission.gov.uk/charity-search/-/charity-details/${c.reg_charity_number}`
        : undefined,
    }));
  },
};

export const NGO_SOURCES: NgoSource[] = [propublica, charityCommission];

/** Run every registry in parallel, isolating failures. */
export async function collectNgo(query: string): Promise<NgoResult[]> {
  return Promise.all(NGO_SOURCES.map(async (s): Promise<NgoResult> => {
    if (!s.available()) {
      return { status: { source: s.name, connected: false, reason: s.reason, count: 0 }, records: [] };
    }
    try {
      const records = await s.search(query);
      return { status: { source: s.name, connected: true, count: records.length }, records };
    } catch (e: any) {
      return { status: { source: s.name, connected: true, count: 0, error: e?.message || "failed" }, records: [] };
    }
  }));
}

export interface NgoAggregate {
  total: number;
  sources: SourceStatus[];
  records: NgoRecord[];
}

/** De-duplicate (by id) and sort: those with reported revenue first (desc),
 * then alphabetical. Pure. */
export function aggregateNgo(results: NgoResult[], limit = 40): NgoAggregate {
  const sources = results.map((r) => r.status);
  const seen = new Set<string>();
  const all: NgoRecord[] = [];
  for (const rec of results.flatMap((r) => r.records)) {
    const k = (rec.id || rec.url || rec.name || "").toLowerCase();
    if (k && seen.has(k)) continue;
    if (k) seen.add(k);
    all.push(rec);
  }
  all.sort((a, b) => (b.revenue ?? -1) - (a.revenue ?? -1) || a.name.localeCompare(b.name));
  return { total: all.length, sources, records: all.slice(0, limit) };
}
