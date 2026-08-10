// OSINT pivot adapters - one per external selector source. Each runs a REAL
// query against the provider's OFFICIAL API the moment its key is present, and
// returns an honest "not connected" state otherwise (rule 7). Official endpoints
// only - no scrapers, no wrapper resellers (rule 5). Results are the actual
// MEMBER domains behind a shared selector (the pivot), deduped + capped; cached
// upstream by lib/http where applicable. Pure helpers are unit-tested; the
// network calls degrade to null on any error (failure isolation).

import { getJson, getText } from "@/lib/http";

export const OSINT_ADAPTERS_VERSION = "osint-adapters-v1";
const MAX_MEMBERS = 500;

export interface AdapterResult {
  tool: string; // stable id, e.g. "reversetracker.spyonweb"
  connected: boolean;
  members: string[]; // domains/hosts sharing the selector (empty when none/none-connected)
  count: number | null; // provider-reported total when given, else members.length, else null
  note: string;
  url?: string; // human-viewable provider link
}

// ---------------------------------------------------------------------------
// Pure helpers (tested)
// ---------------------------------------------------------------------------

/** Normalize a host: lowercase, strip scheme/path/port/leading '*.'/'www.'. */
export function normHost(input: string): string {
  let s = (input || "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split("/")[0].split("?")[0];
  s = s.split("@").pop() || s;
  s = s.split(":")[0].replace(/^\*\./, "").replace(/^www\./, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : "";
}

/** Dedupe + normalize a list of hosts, capped. Pure. */
export function dedupeDomains(list: string[], cap = MAX_MEMBERS): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const h = normHost(raw);
    if (h && !seen.has(h)) { seen.add(h); out.push(h); if (out.length >= cap) break; }
  }
  return out;
}

/** PublicWWW CSV export → host list (drops the total/summary line). Pure. */
export function parsePublicwwwCsv(csv: string): string[] {
  return dedupeDomains(
    csv.split(/\r?\n/).map((l) => l.replace(/^"|"$/g, "").split(";")[0].split(",")[0].trim())
      .filter((l) => l && !/^total/i.test(l)),
  );
}

/** SpyOnWeb analytics response → domains carrying `id`. Pure. */
export function parseSpyonwebItems(json: any, id: string): string[] {
  const items = json?.result?.analytics?.[id]?.items || json?.result?.adsense?.[id]?.items || {};
  return dedupeDomains(Object.keys(items));
}

/** Which env keys power a given selector kind → adapter ids to try. Pure. */
export function adaptersForKind(kind: string): string[] {
  const trackerKinds = new Set(["ga_id", "adsense_id", "gtm_id", "fb_pixel_id", "yandex_id", "hotjar_id", "clarity_id", "verification_token", "code"]);
  if (trackerKinds.has(kind)) return ["reversetracker.spyonweb", "reversetracker.publicwww", "reversetracker.dnslytics"];
  if (kind === "domain") return ["crtsh.certs", "securitytrails.subdomains", "urlscan.search"];
  return [];
}

const notConnected = (tool: string, envName: string): AdapterResult => ({
  tool, connected: false, members: [], count: null,
  note: `${tool} not connected - set ${envName} to enable this pivot.`,
});

// ---------------------------------------------------------------------------
// Live adapters (official endpoints; honest not-connected without a key)
// ---------------------------------------------------------------------------

async function spyOnWeb(id: string): Promise<AdapterResult> {
  const key = (process.env.SPYONWEB_API_KEY || process.env.SPYONWEB_API);
  if (!key) return notConnected("reversetracker.spyonweb", "SPYONWEB_API_KEY");
  try {
    const j = await getJson<any>(`https://api.spyonweb.com/v1/analytics/${encodeURIComponent(id)}?access_token=${key}`, { timeoutMs: 8000 });
    const members = j?.status === "found" ? parseSpyonwebItems(j, id) : [];
    return { tool: "reversetracker.spyonweb", connected: true, members, count: members.length, note: `SpyOnWeb: ${members.length} site(s) carry this id.`, url: `https://spyonweb.com/${encodeURIComponent(id)}` };
  } catch { return { tool: "reversetracker.spyonweb", connected: true, members: [], count: null, note: "SpyOnWeb query failed - try again." }; }
}

async function publicWww(value: string): Promise<AdapterResult> {
  const key = (process.env.PUBLICWWW_API_KEY || process.env.PUBLICWWW_API);
  if (!key) return notConnected("reversetracker.publicwww", "PUBLICWWW_API_KEY");
  try {
    const csv = await getText(`https://publicwww.com/websites/%22${encodeURIComponent(value)}%22/?export=csv&key=${key}`, { timeoutMs: 9000 });
    const members = csv == null ? [] : parsePublicwwwCsv(csv);
    return { tool: "reversetracker.publicwww", connected: true, members, count: members.length, note: `PublicWWW source-code search matched ${members.length} site(s).`, url: `https://publicwww.com/websites/%22${encodeURIComponent(value)}%22/` };
  } catch { return { tool: "reversetracker.publicwww", connected: true, members: [], count: null, note: "PublicWWW query failed - try again." }; }
}

async function dnslytics(id: string): Promise<AdapterResult> {
  const key = (process.env.DNSLYTICS_API_KEY || process.env.DNSLYTICS_API);
  if (!key) return notConnected("reversetracker.dnslytics", "DNSLYTICS_API_KEY");
  try {
    const j = await getJson<any>(`https://api.dnslytics.net/v1/reverseanalytics/${encodeURIComponent(id)}?apikey=${key}`, { timeoutMs: 9000 });
    const rows: any[] = Array.isArray(j?.domains) ? j.domains : Array.isArray(j?.data) ? j.data : [];
    const members = dedupeDomains(rows.map((r) => (typeof r === "string" ? r : r?.domain || r?.name || "")));
    const count = typeof j?.total === "number" ? j.total : members.length;
    return { tool: "reversetracker.dnslytics", connected: true, members, count, note: `DNSlytics reverse-analytics matched ${count} domain(s).` };
  } catch { return { tool: "reversetracker.dnslytics", connected: true, members: [], count: null, note: "DNSlytics query failed - try again." }; }
}

async function crtsh(domain: string): Promise<AdapterResult> {
  // Keyless, always available (Certificate Transparency). Free-source check.
  try {
    const j = await getJson<any[]>(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`, { timeoutMs: 12000 });
    const names = Array.isArray(j) ? j.flatMap((r) => String(r?.name_value || "").split(/\n/)) : [];
    const members = dedupeDomains(names);
    return { tool: "crtsh.certs", connected: true, members, count: members.length, note: `crt.sh: ${members.length} unique host(s) in CT logs for ${domain}.`, url: `https://crt.sh/?q=%25.${encodeURIComponent(domain)}` };
  } catch { return { tool: "crtsh.certs", connected: true, members: [], count: null, note: "crt.sh query failed - try again." }; }
}

async function securityTrailsSubdomains(domain: string): Promise<AdapterResult> {
  const key = (process.env.SECURITYTRAILS_API_KEY || process.env.SECURITYTRAILS_API);
  if (!key) return notConnected("securitytrails.subdomains", "SECURITYTRAILS_API_KEY");
  try {
    const j = await getJson<any>(`https://api.securitytrails.com/v1/domain/${encodeURIComponent(domain)}/subdomains?apikey=${key}`, { timeoutMs: 9000 });
    const subs: string[] = Array.isArray(j?.subdomains) ? j.subdomains : [];
    const members = dedupeDomains(subs.map((s) => `${s}.${domain}`));
    return { tool: "securitytrails.subdomains", connected: true, members, count: typeof j?.subdomain_count === "number" ? j.subdomain_count : members.length, note: `SecurityTrails: ${members.length} subdomain(s) for ${domain}.` };
  } catch { return { tool: "securitytrails.subdomains", connected: true, members: [], count: null, note: "SecurityTrails query failed - check the key/plan." }; }
}

async function urlscanSearch(query: string): Promise<AdapterResult> {
  const key = (process.env.URLSCAN_API_KEY || process.env.URLSCAN_API);
  if (!key) return notConnected("urlscan.search", "URLSCAN_API_KEY");
  try {
    const j = await getJson<any>(`https://urlscan.io/api/v1/search/?q=${encodeURIComponent(query)}&size=100`, { timeoutMs: 10000, headers: { "API-Key": key } });
    const results: any[] = Array.isArray(j?.results) ? j.results : [];
    const members = dedupeDomains(results.map((r) => r?.page?.domain || r?.task?.domain || ""));
    return { tool: "urlscan.search", connected: true, members, count: typeof j?.total === "number" ? j.total : members.length, note: `urlscan.io: ${members.length} recent scan domain(s) for this query.`, url: `https://urlscan.io/search/#${encodeURIComponent(query)}` };
  } catch { return { tool: "urlscan.search", connected: true, members: [], count: null, note: "urlscan query failed - check the key." }; }
}

const REGISTRY: Record<string, (value: string) => Promise<AdapterResult>> = {
  "reversetracker.spyonweb": spyOnWeb,
  "reversetracker.publicwww": publicWww,
  "reversetracker.dnslytics": dnslytics,
  "crtsh.certs": crtsh,
  "securitytrails.subdomains": securityTrailsSubdomains,
  "urlscan.search": urlscanSearch,
};

export interface PivotResult {
  kind: string;
  value: string;
  results: AdapterResult[];
  /** Union of members across all connected adapters (the pivot's new nodes). */
  members: string[];
  connectedTools: string[];
  notConnectedTools: string[];
}

/**
 * Run every adapter relevant to a selector kind. Connected ones query live;
 * others report honest not-connected. Members are the union across providers -
 * a co-behavior LEAD for a human analyst, never proof of shared operation.
 */
export async function runPivot(kind: string, value: string): Promise<PivotResult> {
  const ids = adaptersForKind(kind);
  const results = await Promise.all(ids.map((id) => REGISTRY[id]?.(value) ?? Promise.resolve(notConnected(id, "API key"))));
  const members = dedupeDomains(results.flatMap((r) => r.members));
  return {
    kind, value, results, members,
    connectedTools: results.filter((r) => r.connected).map((r) => r.tool),
    notConnectedTools: results.filter((r) => !r.connected).map((r) => r.tool),
  };
}
