// SSRF-guarded fetch + RSS/Atom parse + sanitize for user-supplied feed URLs.
// A user-pasted URL is UNTRUSTED input (CLAUDE.md rule 5): every server-side fetch
// (validation AND scans) runs through safeFetchText, which rejects non-http(s)
// schemes and any host that resolves to a private/loopback/link-local/metadata
// range, caps redirects/size/time, and sends a declared User-Agent. Feed content is
// data, never instructions: titles/summaries are HTML-stripped before store/render.

import { promises as dns } from "node:dns";
import net from "node:net";

export const FETCH_UA = "TruthLens/0.1 (+RSS connections; brand narrative monitoring)";
export const MAX_REDIRECTS = 3;
export const MAX_BYTES = 2_000_000;   // 2 MB cap per feed
export const FETCH_TIMEOUT_MS = 12_000;
export const PREVIEW_ITEMS = 5;

export interface FeedItem { title: string; link?: string; guid?: string; summary?: string; timestamp?: string; lang?: string }
export interface ParsedFeed { title?: string; siteUrl?: string; items: FeedItem[]; kind: "rss" | "atom" }

// ---- SSRF guard --------------------------------------------------------------

/** True when an IP literal is private / loopback / link-local / unique-local /
 * metadata — anything that must never be reachable from a user-supplied URL. */
export function isBlockedIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = p;
    if (a === 10) return true;                       // 10/8
    if (a === 127) return true;                      // loopback
    if (a === 0) return true;                        // 0.0.0.0/8
    if (a === 169 && b === 254) return true;         // link-local incl. 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true;         // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a >= 224) return true;                       // multicast / reserved
    return false;
  }
  if (v === 6) {
    const lo = ip.toLowerCase();
    if (lo === "::1" || lo === "::") return true;    // loopback / unspecified
    if (lo.startsWith("fe80")) return true;          // link-local
    if (lo.startsWith("fc") || lo.startsWith("fd")) return true; // unique-local fc00::/7
    if (lo.startsWith("::ffff:")) return isBlockedIp(lo.slice(7)); // IPv4-mapped
    if (lo === "::ffff:a9fe:a9fe") return true;      // mapped metadata
    return false;
  }
  return true; // not a valid IP literal → block (unknown)
}

/** True when a hostname is obviously internal by name (no DNS needed). */
export function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h === "metadata.google.internal") return true;
  return false;
}

/** Validate a URL for SSRF: http(s) only, host not internal, and NONE of its
 * resolved IPs in a blocked range. Throws a user-safe Error when unsafe. */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Not a valid URL."); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http(s) feed URLs are allowed.");
  const host = u.hostname;
  if (isBlockedHostname(host)) throw new Error("That host is not allowed.");
  // Literal IP in the URL → check directly.
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error("That address range is not allowed.");
    return u;
  }
  // Resolve the hostname and reject if ANY address is in a blocked range.
  let addrs: { address: string }[] = [];
  try { addrs = await dns.lookup(host, { all: true }); } catch { throw new Error("Could not resolve that host."); }
  if (!addrs.length) throw new Error("Could not resolve that host.");
  for (const a of addrs) if (isBlockedIp(a.address)) throw new Error("That host resolves to a blocked address range.");
  return u;
}

/** SSRF-guarded text fetch with capped redirects/size/time. Re-checks the host on
 * every redirect hop. Returns the body + final URL + relevant caching headers. */
export async function safeFetchText(
  raw: string,
  opts: { etag?: string; lastModified?: string } = {},
): Promise<{ text: string; finalUrl: string; status: number; etag?: string; lastModified?: string; notModified?: boolean }> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = await assertSafeUrl(current);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      const headers: Record<string, string> = { "User-Agent": FETCH_UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" };
      if (hop === 0 && opts.etag) headers["If-None-Match"] = opts.etag;
      if (hop === 0 && opts.lastModified) headers["If-Modified-Since"] = opts.lastModified;
      res = await fetch(u.toString(), { redirect: "manual", signal: ctrl.signal, headers });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 304) return { text: "", finalUrl: u.toString(), status: 304, notModified: true, etag: opts.etag, lastModified: opts.lastModified };
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`Redirect without a location (HTTP ${res.status}).`);
      current = new URL(loc, u).toString();
      continue;
    }
    if (!res.ok) throw new Error(`Feed responded HTTP ${res.status}.`);
    // Size-capped read.
    const reader = res.body?.getReader();
    if (!reader) {
      const t = (await res.text()).slice(0, MAX_BYTES);
      return { text: t, finalUrl: u.toString(), status: res.status, etag: res.headers.get("etag") || undefined, lastModified: res.headers.get("last-modified") || undefined };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) { total += value.length; chunks.push(value); if (total > MAX_BYTES) { reader.cancel(); break; } }
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(concat(chunks)).slice(0, MAX_BYTES);
    return { text, finalUrl: u.toString(), status: res.status, etag: res.headers.get("etag") || undefined, lastModified: res.headers.get("last-modified") || undefined };
  }
  throw new Error("Too many redirects.");
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

// ---- sanitize ----------------------------------------------------------------

/** Strip HTML/CDATA/entities from feed text — content is DATA, never rendered as
 * markup and never executed. */
export function sanitizeText(s: string, max = 500): string {
  if (!s) return "";
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return " "; } })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// ---- parse (RSS + Atom) ------------------------------------------------------

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
}
function attr(block: string, name: string, a: string): string | undefined {
  const m = block.match(new RegExp(`<${name}\\b[^>]*\\b${a}=["']([^"']+)["']`, "i"));
  return m ? m[1] : undefined;
}
function toIso(v?: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v.trim());
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Parse an RSS 2.0 or Atom document. Throws when it is neither (so an invalid
 * feed is rejected and never saved). Titles/summaries are sanitized. */
export function parseFeed(xml: string): ParsedFeed {
  if (!xml || !/<(rss|feed|rdf:RDF)\b/i.test(xml)) throw new Error("This URL does not look like an RSS or Atom feed.");
  const isAtom = /<feed\b[^>]*xmlns=["'][^"']*Atom/i.test(xml) || (/<feed\b/i.test(xml) && /<entry\b/i.test(xml));

  if (isAtom) {
    const head = xml.split(/<entry[\s>]/i)[0];
    const title = sanitizeText(tag(head, "title"), 200);
    const siteUrl = attr(head, "link", "href");
    const items: FeedItem[] = [];
    for (const raw of xml.split(/<entry[\s>]/i).slice(1)) {
      const block = "<entry " + raw;
      items.push({
        title: sanitizeText(tag(block, "title"), 300),
        link: attr(block, "link", "href") || undefined,
        guid: sanitizeText(tag(block, "id"), 300) || undefined,
        summary: sanitizeText(tag(block, "summary") || tag(block, "content"), 500) || undefined,
        timestamp: toIso(tag(block, "updated") || tag(block, "published")),
      });
    }
    return { title, siteUrl, items, kind: "atom" };
  }

  // RSS 2.0 / RDF
  const head = xml.split(/<item[\s>]/i)[0];
  const title = sanitizeText(tag(head, "title"), 200);
  const siteUrl = sanitizeText(tag(head, "link"), 300) || undefined;
  const items: FeedItem[] = [];
  for (const raw of xml.split(/<item[\s>]/i).slice(1)) {
    const block = "<item " + raw;
    items.push({
      title: sanitizeText(tag(block, "title"), 300),
      link: sanitizeText(tag(block, "link"), 300) || undefined,
      guid: sanitizeText(tag(block, "guid"), 300) || undefined,
      summary: sanitizeText(tag(block, "description"), 500) || undefined,
      timestamp: toIso(tag(block, "pubDate") || tag(block, "dc:date")),
    });
  }
  if (!items.length && !title) throw new Error("This URL does not look like an RSS or Atom feed.");
  return { title, siteUrl, items, kind: "rss" };
}
