// Link Board collection + comparison. Builds a server/infrastructure + any-
// artifact fingerprint per domain from the enrichment the Site Report pipeline
// already performs, plus ONE lightweight GET (headers + HTML) the app already
// does - no crawling, no port scanning, no active probing (CLAUDE.md rules 5/6).
// Then compares every pair through the calibrated rubric in calibrate.ts.
//
// Nodes are domains/infra, never people. Org-PUBLISHED contact (role mailboxes,
// tel: links) may be an artifact; personal names/emails/phones never are.

import { fetchWithTimeout } from "@/lib/http";
import { lookupDns, firstIp, mxHosts } from "@/lib/dns";
import { enrichIp, lookupHosting } from "@/lib/ip";
import { lookupSsl } from "@/lib/ssl";
import { lookupRdap } from "@/lib/rdap";
import { reverseIp } from "@/lib/reverseip";
import { fingerprint as techFingerprint } from "@/lib/fingerprint";
import { normalizeText, jaccard, signatureOf } from "@/lib/similarity";
import { cacheGet, cacheSet } from "@/lib/cache";
import { calibrateOverlap, buildPairEdge, BOARD_RUBRIC_VERSION } from "./calibrate";
import type { Artifact, Fingerprint, BoardResult, OverlapItem, PairEdge, SourceStatus } from "./types";
import type { ConfidenceLevel } from "@/components/ConfidenceBadge";

const FETCH_MS = 9000;
const FP_TTL = 24 * 3600_000; // reproducible per (domain, day)
const BOILERPLATE_JACCARD = 0.6;
const REG_DATE_PROXIMITY_DAYS = 30;

// Role mailboxes we accept as ORG contact. Anything else (a personal name) is
// never turned into an artifact - the no-personal-data gate.
const ROLE_MAILBOX = /^(info|contact|support|sales|admin|office|hello|press|media|team|help|enquiries|inquiries|marketing|billing|legal|privacy|webmaster|no-?reply|donotreply)$/i;

// Accept an email as an ORG contact artifact ONLY when its local part is a role
// mailbox (info@, contact@, ...). A personal address (john.doe@...) returns null
// and is never turned into an artifact - the no-personal-data gate.
export function orgEmail(email: string): string | null {
  const e = (email || "").trim().toLowerCase();
  const local = e.split("@")[0] || "";
  return e.includes("@") && ROLE_MAILBOX.test(local) ? e : null;
}

const TWO_LEVEL_TLD = new Set(["co.uk","org.uk","gov.uk","ac.uk","com.au","net.au","org.au","co.il","org.il","co.nz","co.za","com.br","com.tr"]);

function host(u: string): string { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } }
function registrable(h: string): string {
  const p = h.toLowerCase().replace(/^www\./, "").split(".");
  if (p.length <= 2) return p.join(".");
  const last2 = p.slice(-2).join("."), last3 = p.slice(-3).join(".");
  return TWO_LEVEL_TLD.has(last2) ? last3 : last2;
}
function ipPrefix(ip: string, octets: number): string | null {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return m.slice(1, 1 + octets).join(".");
}
function push(list: Artifact[], kind: Artifact["kind"], value?: string | null, display?: string) {
  const v = (value || "").trim().toLowerCase();
  if (!v) return;
  if (list.some((a) => a.kind === kind && a.value === v)) return;
  list.push({ kind, value: v, display: display || value!.trim() });
}

// ---- per-entity fingerprint -------------------------------------------------
export async function collectFingerprint(domain: string): Promise<Fingerprint> {
  const entity = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();
  const ck = `board:fp:${entity}:${new Date().toISOString().slice(0, 10)}`;
  const cached = await cacheGet<Fingerprint>(ck, FP_TTL);
  if (cached) return cached;

  const artifacts: Artifact[] = [];
  const errors: string[] = [];
  let neighborCount: number | null = null;
  let cdn = false;
  let wildcardCertOrCdnIssuer = false;
  let createdAt: string | undefined;
  let boilerplate: string | undefined;
  let neighbors: string[] = [];
  const gaIds: string[] = [];
  const adsenseIds: string[] = [];
  const sans: string[] = [];

  // DNS + IP + hosting
  let primaryIp: string | undefined;
  try {
    const dns = await lookupDns(entity);
    primaryIp = firstIp(dns) || undefined;
    for (const ns of dns.ns || []) push(artifacts, "ns_set", ns);
    for (const mx of mxHosts(dns)) push(artifacts, "mx_host", mx);
  } catch (e: any) { errors.push(`dns: ${e?.message || "failed"}`); }

  if (primaryIp) {
    push(artifacts, "ip", primaryIp);
    const p24 = ipPrefix(primaryIp, 3), p16 = ipPrefix(primaryIp, 2);
    if (p24) push(artifacts, "ip_24", `${p24}.0/24`);
    if (p16) push(artifacts, "ip_16", `${p16}.0.0/16`);
    try {
      const [ipInfo, hosting, neighborList] = await Promise.all([
        enrichIp(primaryIp).catch(() => null),
        lookupHosting(primaryIp).catch(() => null),
        reverseIp(primaryIp).catch(() => [] as string[]),
      ]);
      if (ipInfo) {
        if (ipInfo.asn) push(artifacts, "asn", String(ipInfo.asn));
        if (ipInfo.asnOrg) push(artifacts, "as_org", ipInfo.asnOrg);
        if (ipInfo.ptr) push(artifacts, "ptr_pattern", ipInfo.ptr.replace(/^[^.]+\./, "")); // drop host label, keep pattern
        if (ipInfo.country) push(artifacts, "hosting_country", ipInfo.country);
      }
      if (hosting) cdn = !!hosting.cdn || !!hosting.cdnMasksOrigin;
      neighbors = Array.isArray(neighborList) ? neighborList.map((n) => n.toLowerCase().replace(/^www\./, "")).filter((d) => d && d !== entity) : [];
      neighborCount = neighbors.length;
    } catch (e: any) { errors.push(`ip: ${e?.message || "failed"}`); }
  }

  // SSL SANs (cert identity)
  try {
    const ssl = await lookupSsl(entity);
    const issuer = (ssl.issuer || "").toLowerCase();
    const cdnIssuer = /(cloudflare|google trust|amazon|fastly|sectigo ecc.*cloudflare)/i.test(issuer);
    for (const san of ssl.sanDomains || []) {
      const s = san.toLowerCase();
      if (s === entity) continue;
      if (s.startsWith("*.")) { wildcardCertOrCdnIssuer = true; continue; }
      push(artifacts, "ssl_san", s);
      sans.push(s);
    }
    if (cdnIssuer) wildcardCertOrCdnIssuer = true;
  } catch (e: any) { errors.push(`ssl: ${e?.message || "failed"}`); }

  // RDAP (registrar + created date)
  try {
    const rdap = await lookupRdap(entity);
    if (rdap.registrar) push(artifacts, "registrar", rdap.registrar);
    if (rdap.createdAt) createdAt = rdap.createdAt;
  } catch (e: any) { errors.push(`rdap: ${e?.message || "failed"}`); }

  // One lightweight GET: headers + HTML
  try {
    const resp = await fetchWithTimeout(`https://${entity}/`, { timeoutMs: FETCH_MS, redirect: "follow" });
    const hdrs: Record<string, string> = {};
    resp.headers.forEach((v, k) => { hdrs[k] = v; });
    const html = await resp.text().catch(() => "");

    // server software (weak)
    if (hdrs["server"]) push(artifacts, "server_header", hdrs["server"].split("/")[0]);
    // CSP report endpoint (strong if distinctive)
    const csp = hdrs["content-security-policy"] || hdrs["content-security-policy-report-only"] || "";
    const rep = csp.match(/report-uri\s+([^;]+)/i)?.[1] || csp.match(/report-to\s+([^;]+)/i)?.[1];
    if (rep) { const h = host(rep.trim().split(/\s+/)[0]); if (h) push(artifacts, "csp_report_uri", h); }

    // tech stack (weak) via existing fingerprint()
    const tech = techFingerprint(html, hdrs, entity);
    if (tech.cms) push(artifacts, "cms", tech.cms);
    for (const f of tech.frameworks || []) push(artifacts, "framework", f);
    for (const g of tech.gaIds || []) { push(artifacts, "ga_id", g); gaIds.push(g); }
    for (const a of tech.adsenseIds || []) { push(artifacts, "adsense_id", a); adsenseIds.push(a); }

    // strong ID-bearing tags via regex (no new dependency)
    for (const m of html.matchAll(/GTM-[A-Z0-9]{4,}/g)) push(artifacts, "gtm_id", m[0]);
    for (const m of html.matchAll(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{6,})['"]/g)) push(artifacts, "fb_pixel_id", m[1]);
    for (const m of html.matchAll(/hotjar[^0-9]{0,20}hjid\s*[:=]\s*(\d{4,})/gi)) push(artifacts, "hotjar_id", m[1]);
    for (const m of html.matchAll(/clarity[^"']{0,40}["']([a-z0-9]{8,12})["']/gi)) push(artifacts, "clarity_id", m[1]);
    for (const m of html.matchAll(/ym\(\s*(\d{5,})\s*,/g)) push(artifacts, "yandex_id", m[1]);
    const matomoHost = html.match(/\/\/([a-z0-9.-]+)\/matomo\.js/i)?.[1] || html.match(/setTrackerUrl[^"']+["']https?:\/\/([a-z0-9.-]+)\//i)?.[1];
    const matomoSite = html.match(/setSiteId["',\s]+["']?(\d+)/i)?.[1];
    if (matomoHost && matomoSite) push(artifacts, "matomo_id", `${matomoHost.toLowerCase()}#${matomoSite}`, `${matomoHost} site ${matomoSite}`);
    for (const m of html.matchAll(/name=["']google-site-verification["']\s+content=["']([^"']+)["']/gi)) push(artifacts, "verification_token", `google:${m[1]}`);

    // embedded third-party origins (script/img/iframe) + outbound link domains
    const self = registrable(entity);
    for (const m of html.matchAll(/<(?:script|img|iframe)[^>]+src=["']([^"']+)["']/gi)) {
      const h = host(m[1]); if (h && registrable(h) !== self) push(artifacts, "third_party_origin", registrable(h));
    }
    for (const m of html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/gi)) {
      const h = host(m[1]); if (!h) continue;
      const reg = registrable(h);
      if (reg === self) continue;
      // social handles (platform + path) vs plain outbound domains
      const social = m[1].match(/https?:\/\/(?:www\.)?(facebook|twitter|x|instagram|linkedin|youtube|tiktok|t\.me|telegram)\.[a-z.]+\/([^\/"'?#\s]+)/i);
      if (social && social[2] && !/^(share|intent|sharer|home|hashtag|watch)$/i.test(social[2])) {
        push(artifacts, "social_handle", `${social[1].toLowerCase()}:${social[2].toLowerCase()}`, `${social[1]}/${social[2]}`);
      } else {
        push(artifacts, "outbound_domain", reg);
      }
    }

    // ORG-published contact only: role mailboxes + tel: links. Personal names excluded.
    for (const m of html.matchAll(/mailto:([^"'?\s]+@[^"'?\s]+)/gi)) {
      const oe = orgEmail(m[1]);
      if (oe) push(artifacts, "org_email", oe);
    }
    for (const m of html.matchAll(/tel:(\+?[0-9()\-.\s]{7,})/gi)) {
      const phone = m[1].replace(/[^0-9+]/g, "");
      if (phone.length >= 7) push(artifacts, "org_phone", phone, m[1].trim());
    }

    // boilerplate (copyright / footer line) for similarity comparison
    const copy = html.match(/(©|&copy;|copyright)[^<]{4,160}/i)?.[0];
    if (copy) { const n = normalizeText(copy); if (n.length >= 8) boilerplate = n; }
  } catch (e: any) { errors.push(`http: ${e?.message || "failed"}`); }

  const fp: Fingerprint = {
    entity, artifacts, neighborCount, cdn, wildcardCertOrCdnIssuer, errors,
    ip: primaryIp, neighbors, gaIds, adsenseIds, sans,
    ...(createdAt ? { createdAt } : {}), ...(boilerplate ? { boilerplate } : {}),
  } as Fingerprint;
  await cacheSet(ck, fp);
  return fp;
}

// ---- operator network (same shape as Site Report's NetworkGraph) ------------
// Merge every pasted domain's infrastructure into ONE graph. Because shared
// nodes (an IP, a GA/AdSense id, an SSL SAN host) get the SAME id, two domains
// that share one are automatically connected - that IS the network. Reverse-IP
// neighbours are only expanded on dedicated hosts (CDN/shared IPs are noise).
const NET_SHARED_IP_THRESHOLD = 12;

export function buildLinkNetwork(fps: Fingerprint[]): import("./types").BoardNetwork {
  const nodes = new Map<string, import("./types").BoardNetwork["nodes"][number]>();
  const edges: import("./types").BoardNetwork["edges"] = [];
  const seenEdge = new Set<string>();
  const addNode = (id: string, label: string, kind: import("./types").BoardNetwork["nodes"][number]["kind"]) => {
    if (!nodes.has(id)) nodes.set(id, { id, label, kind });
  };
  const addEdge = (source: string, target: string, reason: string) => {
    if (source === target) return;
    const k = `${source}|${target}|${reason}`;
    if (seenEdge.has(k)) return;
    seenEdge.add(k);
    edges.push({ source, target, reason });
  };

  let hidden = 0;
  for (const f of fps) {
    addNode(f.entity, f.entity, "target");
    if (f.ip) {
      const ipId = `ip:${f.ip}`;
      addNode(ipId, f.ip, "ip");
      addEdge(f.entity, ipId, "hosted on IP");
      const dedicated = !f.cdn && (f.neighborCount ?? 0) <= NET_SHARED_IP_THRESHOLD;
      if (dedicated) {
        for (const n of (f.neighbors || []).slice(0, 20)) { addNode(n, n, "domain"); addEdge(ipId, n, "shared dedicated IP"); }
      } else {
        hidden += f.neighbors?.length || 0;
      }
    }
    for (const san of (f.sans || []).slice(0, 25)) { addNode(san, san, "domain"); addEdge(f.entity, san, "shared SSL certificate (SAN)"); }
    for (const g of f.gaIds || []) { const id = `ga:${g}`; addNode(id, g, "ga"); addEdge(f.entity, id, "Google Analytics ID"); }
    for (const a of f.adsenseIds || []) { const id = `ad:${a}`; addNode(id, a, "adsense"); addEdge(f.entity, id, "AdSense ID"); }
  }

  const note = hidden > 0
    ? `${hidden} reverse-IP co-tenant domain(s) hidden - they sit on a CDN/shared host, so they are not a reliable operator link. Shared IP, SSL, and analytics/ad IDs between your domains are shown.`
    : undefined;
  return { nodes: [...nodes.values()], edges, note };
}

// ---- pairwise comparison ----------------------------------------------------
function artifactKey(kind: string, value: string) { return `${kind}|${value}`; }

export function compareFingerprints(fps: Fingerprint[]): BoardResult {
  const entities = fps.map((f) => f.entity);
  const n = fps.length;

  // commonness within the board: how many entities share each exact artifact.
  const share = new Map<string, number>();
  for (const f of fps) for (const a of f.artifacts) {
    const k = artifactKey(a.kind, a.value);
    share.set(k, (share.get(k) || 0) + 1);
  }

  const matrix: (ConfidenceLevel | null)[][] = Array.from({ length: n }, () => Array<ConfidenceLevel | null>(n).fill(null));
  const edges: PairEdge[] = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const A = fps[i], B = fps[j];
      const bArts = new Map(B.artifacts.map((a) => [artifactKey(a.kind, a.value), a]));
      const items: OverlapItem[] = [];

      for (const a of A.artifacts) {
        const k = artifactKey(a.kind, a.value);
        const b = bArts.get(k);
        if (!b) continue;
        const item = calibrateOverlap(a.kind, a.value, a.display || a.value, {
          shareCount: share.get(k) || 2,
          totalEntities: n,
          neighborCount: a.kind === "ip" ? Math.min(A.neighborCount ?? Infinity, B.neighborCount ?? Infinity) : undefined,
          cdn: A.cdn || B.cdn,
          wildcardOrCdnCert: a.kind === "ssl_san" ? (A.wildcardCertOrCdnIssuer || B.wildcardCertOrCdnIssuer) : undefined,
          source: sourceOf(a.kind),
        });
        items.push(item);
      }

      // pair-derived: registration-date proximity + boilerplate similarity
      if (A.createdAt && B.createdAt) {
        const days = Math.abs(new Date(A.createdAt).getTime() - new Date(B.createdAt).getTime()) / 86_400_000;
        if (isFinite(days) && days <= REG_DATE_PROXIMITY_DAYS) {
          items.push(calibrateOverlap("reg_date_proximity", `${Math.round(days)}d`, `registered ${Math.round(days)} day(s) apart`, { shareCount: 2, totalEntities: n, source: "RDAP" }));
        }
      }
      if (A.boilerplate && B.boilerplate && jaccard(signatureOf(A.boilerplate), signatureOf(B.boilerplate)) >= BOILERPLATE_JACCARD) {
        items.push(calibrateOverlap("boilerplate", "shared", "shared footer/copyright text", { shareCount: 2, totalEntities: n, source: "page HTML" }));
      }

      // avoid double-counting subnet proximity when the exact IP already matched
      const hasExactIp = items.some((it) => it.kind === "ip");
      const pruned = hasExactIp ? items.filter((it) => it.kind !== "ip_24" && it.kind !== "ip_16") : items;
      if (!pruned.length) continue;

      const edge = buildPairEdge(A.entity, B.entity, pruned);
      matrix[i][j] = matrix[j][i] = edge.strength === "Unknown" ? null : edge.strength;
      if (edge.strength !== "Unknown") edges.push(edge);
    }
  }

  const strengthRank: Record<ConfidenceLevel, number> = { High: 3, Medium: 2, Low: 1, Unknown: 0 };
  edges.sort((a, b) => strengthRank[b.strength] - strengthRank[a.strength] || b.overlapCount - a.overlapCount);

  const sources: SourceStatus[] = fps.map((f) => ({ source: f.entity, ok: f.errors.length === 0, note: f.errors.join("; ") || undefined }));

  return {
    entities, edges, matrix,
    network: buildLinkNetwork(fps),
    rubricVersion: BOARD_RUBRIC_VERSION,
    generatedAt: new Date().toISOString(),
    sources,
    fingerprints: fps.map((f) => ({ entity: f.entity, artifactCount: f.artifacts.length, errors: f.errors })),
  };
}

function sourceOf(kind: string): string {
  if (kind.startsWith("ip") || kind === "asn" || kind === "as_org" || kind === "ptr_pattern" || kind === "hosting_country") return "IP/ASN enrichment";
  if (kind === "ns_set" || kind === "mx_host") return "DNS";
  if (kind === "ssl_san") return "TLS certificate";
  if (kind === "registrar") return "RDAP";
  return "page HTML";
}

// Collect all fingerprints (failure-isolated) then compare.
export async function runBoard(domains: string[]): Promise<BoardResult> {
  const uniq = [...new Set(domains.map((d) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim()).filter(Boolean))].slice(0, 12);
  const fps = await Promise.all(uniq.map((d) => collectFingerprint(d).catch((e): Fingerprint => ({
    entity: d, artifacts: [], neighborCount: null, cdn: false, wildcardCertOrCdnIssuer: false, errors: [`collect: ${e?.message || "failed"}`],
  }))));
  return compareFingerprints(fps);
}
