// Clue layer - entity extraction. Pulls the linkable entities out of any check
// result (domain, IP, ASN, account, email domain, GA/AdSense IDs, SSL SANs) so
// repeated entities can be linked across checks. Reuses the SAME signals the
// Site Report operator-graph uses (shared IP / GA / AdSense / SSL SAN), applied
// generically to every check type. Pure + unit-tested.

export type EntityKind =
  | "ip" | "domain" | "asn" | "net_org" | "account" | "email_domain" | "ga_id" | "adsense_id" | "ssl_san";

export interface Entity {
  kind: EntityKind;
  value: string;
}

const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const GA = /\b(?:G-[A-Z0-9]{6,}|UA-\d{4,}-\d+|GT-[A-Z0-9]{6,})\b/g;
const ADSENSE = /\bca-pub-\d{10,}\b/g;
const ASN = /\bAS\d{2,6}\b/gi;
const ASN_ORG = /"asnOrg"\s*:\s*"([^"]+)"/g;
const PRIVATE_IP = /^(?:10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

// Mega-providers/CDNs/registrars: shared use is NOT a distinctive link (nearly
// every site touches one), so they never become a net_org clue. A niche host
// like "1984 ehf" or "virtualroad" is exactly what we DO want to surface.
const GENERIC_NET = /\b(cloudflare|google|amazon|aws|amazonaws|cloudfront|microsoft|azure|akamai|fastly|godaddy|namecheap|digitalocean|linode|ovh|hetzner|vercel|netlify|oracle|alibaba|tencent|leaseweb|hostinger|squarespace|automattic|wordpress|gcore|bunny|stackpath|incapsula|imperva|sucuri|wix|shopify|hostgator|bluehost|dreamhost|contabo|scaleway|upcloud|vultr|render|fly\.io|heroku|fastlylb|edgecast|limelight|verizon|level3|cogent|hurricane|he\.net)\b/i;
const NET_SUFFIX = /\b(ehf|ltd|inc|llc|gmbh|ab|as|bv|co|corp|sa|oy|srl|plc|pvt|limited|company|holdings?|group|networks?|hosting|solutions?|technolog(?:y|ies)|communications?|telecom|datacenter|data|center|centre|cloud|systems?|services?|internet|host|servers?)\b/gi;

function key(e: Entity): string {
  return `${e.kind}:${e.value.toLowerCase()}`;
}

function host(u: string): string | null {
  try {
    const h = new URL(u.startsWith("http") ? u : `http://${u}`).hostname.replace(/^www\./, "").toLowerCase();
    return h.includes(".") ? h : null;
  } catch { return null; }
}

/** Registrable-ish domain: last two labels (e.g. ns0.1984.is -> 1984.is). */
function regDomain(h?: string | null): string | null {
  const v = (h || "").trim().toLowerCase().replace(/\.$/, "");
  if (!v || !v.includes(".")) return null;
  const parts = v.split(".");
  return parts.slice(-2).join(".");
}

/**
 * Canonical operator token from an ASN org name OR a nameserver's own label, so
 * "1984 ehf" (an origin ASN) and "ns0.1984.is" (a nameserver) both collapse to
 * "1984" and link the two searches. Returns null for generic providers / noise.
 */
function normalizeNetOrg(raw?: string | null): string | null {
  let s = (raw || "").toLowerCase().trim();
  if (!s || GENERIC_NET.test(s)) return null;
  s = s.replace(/[.,/&]+/g, " ").replace(NET_SUFFIX, " ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, "-");
  if (s.length < 3 || /^\d{1,2}$/.test(s)) return null;
  return s;
}

/** Extract the linkable entities from a saved check (its input + raw result). */
export function extractEntities(type: string, input: string, result: any): Entity[] {
  const found = new Map<string, Entity>();
  const add = (kind: EntityKind, value?: string | null) => {
    const v = (value || "").trim();
    if (!v) return;
    const e = { kind, value: v };
    found.set(key(e), e);
  };

  const blob = `${input}\n${(() => { try { return JSON.stringify(result); } catch { return ""; } })()}`;

  const addNetOrg = (raw?: string | null) => { const n = normalizeNetOrg(raw); if (n) add("net_org", n); };

  // Regex sweep over the whole blob.
  for (const m of blob.match(IPV4) || []) if (!PRIVATE_IP.test(m)) add("ip", m);
  for (const m of blob.match(GA) || []) add("ga_id", m.toUpperCase());
  for (const m of blob.match(ADSENSE) || []) add("adsense_id", m.toLowerCase());
  for (const m of blob.match(ASN) || []) add("asn", m.toUpperCase());
  // Hosting/network operator (e.g. "1984 ehf") from every asnOrg field, wherever
  // it is nested - this is what links two sites on the same niche host.
  for (const m of blob.matchAll(ASN_ORG)) addNetOrg(m[1]);

  // URLs → domains (from the input and anywhere in the result).
  for (const m of blob.match(/https?:\/\/[^\s"'<>)]+/g) || []) add("domain", host(m));
  if (!/\s/.test(input.trim())) { const h = host(input.trim()); if (h) add("domain", h); }

  // Known structured fields (best-effort; shapes vary by tool).
  const r = result || {};
  add("domain", r.domain);
  if (Array.isArray(r?.ssl?.sanDomains)) for (const d of r.ssl.sanDomains) { add("ssl_san", d); add("domain", d); }
  if (Array.isArray(r?.trackers?.gaIds)) for (const g of r.trackers.gaIds) add("ga_id", String(g).toUpperCase());
  if (Array.isArray(r?.trackers?.adsenseIds)) for (const a of r.trackers.adsenseIds) add("adsense_id", String(a).toLowerCase());
  if (r?.asn) add("asn", /^AS/i.test(String(r.asn)) ? String(r.asn).toUpperCase() : `AS${r.asn}`);
  addNetOrg(r?.infrastructure?.hosting?.value?.asnOrg);
  addNetOrg(r?.originTrace?.likelyOrigin?.asnOrg);

  // Nameservers (and MX/server hosts) - the registrable domain is a linkable
  // clue, and its own label is a strong operator signal. ns0.1984.is -> domain
  // 1984.is + net_org "1984", which links to any site whose origin ASN is 1984.
  const geo = r?.geography || r?.geo;
  const endpoints: any[] = [
    ...(Array.isArray(geo?.dns) ? geo.dns : []),
    ...(Array.isArray(geo?.mail) ? geo.mail : []),
    ...(geo?.server ? [geo.server] : []),
  ];
  for (const ep of endpoints) {
    if (!ep) continue;
    addNetOrg(ep.asnOrg);
    const rd = regDomain(ep.host);
    if (rd) { add("domain", rd); addNetOrg(rd.split(".")[0]); }
  }
  // Origin-tool exposed records / candidates carry asnOrg too.
  for (const c of Array.isArray(r?.originTrace?.candidates) ? r.originTrace.candidates : []) addNetOrg(c?.asnOrg);
  for (const c of Array.isArray(r?.candidates) ? r.candidates : []) addNetOrg(c?.asnOrg);

  if (type === "email") {
    add("ip", r.originIp);
    const dom = r.domain || host(input) || (String(input).match(/@([a-z0-9.-]+\.[a-z]{2,})/i)?.[1]);
    if (dom && !PRIVATE_IP.test(dom)) add("email_domain", String(dom).toLowerCase());
  }
  if (type === "post") {
    if (Array.isArray(r?.socialProfiles)) for (const p of r.socialProfiles) if (p?.handle) add("account", `@${String(p.handle).replace(/^@/, "")}`);
    const social = input.match(/(?:x\.com|twitter\.com|reddit\.com\/u|t\.me|bsky\.app\/profile)\/([A-Za-z0-9_.]+)/i);
    if (social) add("account", `@${social[1]}`);
  }

  return [...found.values()];
}

export const entityLabel: Record<EntityKind, string> = {
  ip: "IP", domain: "domain", asn: "ASN", net_org: "host/operator", account: "account",
  email_domain: "email domain", ga_id: "Google Analytics ID", adsense_id: "AdSense ID", ssl_san: "SSL SAN",
};

export const entityKey = key;
