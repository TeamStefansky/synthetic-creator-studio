// Nonprofit / NGO public-data lookup for the OSINT toolset. Organizations only -
// registration IDs, category, status and financials taken from PUBLIC regulatory
// filings (IRS Form 990, charity registers). Never trustee/officer person records
// (CLAUDE.md rule 1 + "organizations only; no person records"). Official public
// endpoints only; a source without its key renders "not connected", never faked.
// Failure of one source never aborts the batch.
//
// Sources (federated - there is NO single global nonprofit registry; each
// jurisdiction runs its own and only some expose an official public API. We
// connect the ones that do and show the rest honestly as "not connected"):
//   - ProPublica Nonprofit Explorer (US IRS 990) - keyless, public.
//   - Israel רשם העמותות via data.gov.il CKAN - keyless, official open data.
//   - GLEIF worldwide Legal Entity Identifier index - keyless (every continent).
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

// ---- Israel - רשם העמותות via data.gov.il CKAN (keyless, official) ----------
// Israel's Corporations Authority publishes the associations (עמותות) register
// on the government open-data portal. We self-discover the datastore resource id
// (it drifts over time) via CKAN package_search, cached per process, so no
// fragile hardcoded id. Override with ISRAEL_NGO_RESOURCE_ID if ever needed.

const IL_BASE = "https://data.gov.il/api/3/action";
let ilResourceId: string | null | undefined; // undefined = not looked up yet

async function israelResourceId(): Promise<string | null> {
  if (ilResourceId !== undefined) return ilResourceId;
  if (process.env.ISRAEL_NGO_RESOURCE_ID) return (ilResourceId = process.env.ISRAEL_NGO_RESOURCE_ID);
  try {
    const data = await getJson<any>(`${IL_BASE}/package_search?q=${encodeURIComponent("עמותות")}&rows=10`, {
      timeoutMs: 12000, headers: { "User-Agent": UA },
    });
    const pkgs: any[] = data?.result?.results || [];
    // Prefer a resource that clearly is the associations register and is queryable.
    for (const p of pkgs) for (const r of p.resources || []) {
      if (r.datastore_active && /(עמות|amuta|ngo|nonprofit|association)/i.test(`${r.name || ""} ${p.title || ""} ${p.name || ""}`)) return (ilResourceId = r.id);
    }
    for (const p of pkgs) for (const r of p.resources || []) if (r.datastore_active) return (ilResourceId = r.id);
  } catch { /* fall through to null */ }
  return (ilResourceId = null);
}

/** Case/space-insensitive lookup of the first row field whose key matches any hint. */
function fieldByHint(row: Record<string, any>, hints: RegExp): string | undefined {
  for (const [k, v] of Object.entries(row)) {
    if (hints.test(k) && v != null && String(v).trim()) return String(v).trim();
  }
  return undefined;
}

const israel: NgoSource = {
  name: "israel",
  available: () => true,
  reason: "Israeli associations register (רשם העמותות) via data.gov.il - keyless.",
  async search(q) {
    const resource = await israelResourceId();
    if (!resource) throw new Error("could not locate the Israeli registry dataset on data.gov.il");
    const url = `${IL_BASE}/datastore_search?resource_id=${encodeURIComponent(resource)}&q=${encodeURIComponent(q)}&limit=25`;
    const data = await getJson<any>(url, { timeoutMs: 15000, headers: { "User-Agent": UA } });
    const rows: any[] = data?.result?.records || [];
    return rows.map((row): NgoRecord => {
      const regId = fieldByHint(row, /(מספר.?עמותה|מספר.?ארגון|association.?number|registration)/i);
      const name = fieldByHint(row, /(שם.?עמותה|שם.?ארגון|שם.?בעברית|organization|charity.?name|name)/i) || "(ללא שם)";
      return {
        source: "israel",
        id: `il-amuta:${regId || name}`,
        name,
        country: "IL",
        registrationId: regId,
        status: fieldByHint(row, /(סטטוס|מצב|status)/i),
        category: fieldByHint(row, /(מטרה|מטרות|סיווג|תחום|category|purpose)/i),
        city: fieldByHint(row, /(עיר|ישוב|יישוב|city)/i),
        // The registry entry on the official Guidestar/רשות התאגידים portal.
        url: regId ? `https://www.guidestar.org.il/organization/${regId}` : undefined,
      };
    });
  },
};

// ---- GLEIF - worldwide Legal Entity Identifier index (keyless, official) -----
// Covers legal entities on every continent (companies AND the many NGOs/nonprofits
// that hold an LEI). The genuinely global backbone: name, country, legal form and
// registration status, cited to the official GLEIF record. Organization-level only.

const gleif: NgoSource = {
  name: "gleif",
  available: () => true,
  reason: "GLEIF worldwide legal-entity index - keyless.",
  async search(q) {
    const url = `https://api.gleif.org/api/v1/lei-records?filter%5Bfulltext%5D=${encodeURIComponent(q)}&page%5Bsize%5D=20`;
    const data = await getJson<any>(url, { timeoutMs: 15000, headers: { "User-Agent": UA, Accept: "application/vnd.api+json" } });
    const rows: any[] = data?.data || [];
    return rows.map((row): NgoRecord => {
      const a = row?.attributes || {};
      const ent = a.entity || {};
      const addr = ent.legalAddress || {};
      const lei = a.lei || row.id;
      return {
        source: "gleif",
        id: `lei:${lei}`,
        name: ent.legalName?.name || "(unnamed)",
        country: (addr.country || ent.jurisdiction || "").toString().toUpperCase(),
        registrationId: lei,
        classification: ent.legalForm?.id && ent.legalForm.id !== "8888" ? ent.legalForm.id : undefined,
        status: a.registration?.status || ent.status,
        city: addr.city,
        region: addr.region,
        url: lei ? `https://search.gleif.org/#/record/${lei}` : undefined,
      };
    });
  },
};

export const NGO_SOURCES: NgoSource[] = [propublica, israel, gleif, charityCommission];

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
