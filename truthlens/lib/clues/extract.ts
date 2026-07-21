// Clue layer - entity extraction. Pulls the linkable entities out of any check
// result (domain, IP, ASN, account, email domain, GA/AdSense IDs, SSL SANs) so
// repeated entities can be linked across checks. Reuses the SAME signals the
// Site Report operator-graph uses (shared IP / GA / AdSense / SSL SAN), applied
// generically to every check type. Pure + unit-tested.

export type EntityKind =
  | "ip" | "domain" | "asn" | "account" | "email_domain" | "ga_id" | "adsense_id" | "ssl_san";

export interface Entity {
  kind: EntityKind;
  value: string;
}

const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const GA = /\b(?:G-[A-Z0-9]{6,}|UA-\d{4,}-\d+|GT-[A-Z0-9]{6,})\b/g;
const ADSENSE = /\bca-pub-\d{10,}\b/g;
const ASN = /\bAS\d{2,6}\b/gi;
const PRIVATE_IP = /^(?:10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

function key(e: Entity): string {
  return `${e.kind}:${e.value.toLowerCase()}`;
}

function host(u: string): string | null {
  try {
    const h = new URL(u.startsWith("http") ? u : `http://${u}`).hostname.replace(/^www\./, "").toLowerCase();
    return h.includes(".") ? h : null;
  } catch { return null; }
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

  // Regex sweep over the whole blob.
  for (const m of blob.match(IPV4) || []) if (!PRIVATE_IP.test(m)) add("ip", m);
  for (const m of blob.match(GA) || []) add("ga_id", m.toUpperCase());
  for (const m of blob.match(ADSENSE) || []) add("adsense_id", m.toLowerCase());
  for (const m of blob.match(ASN) || []) add("asn", m.toUpperCase());

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
  ip: "IP", domain: "domain", asn: "ASN", account: "account",
  email_domain: "email domain", ga_id: "Google Analytics ID", adsense_id: "AdSense ID", ssl_san: "SSL SAN",
};

export const entityKey = key;
