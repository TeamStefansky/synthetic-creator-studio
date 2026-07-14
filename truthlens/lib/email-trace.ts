// Email header tracer.
//
// Given the raw source/headers of an email the user RECEIVED, reconstruct the
// delivery hop path (origin first), identify the true originating external IP,
// enrich each hop, and parse SPF/DKIM/DMARC to reach a spoofing verdict. This
// is the closest thing to genuine "content path" tracing available through
// legitimate means — it works only on headers the user already possesses.

import { enrichIps, isPrivateIp } from "./geoenrich";
import type { EmailHop, EmailTrace, EnrichedIp } from "./types";

/** Unfold RFC 5322 folded headers (continuation lines start with WS). */
function unfold(raw: string): string[] {
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s/.test(line) && out.length) {
      out[out.length - 1] += " " + line.trim();
    } else {
      out.push(line);
    }
  }
  return out;
}

function extractIp(s: string): string | null {
  // Prefer bracketed IPs, then bare IPv4.
  const bracket = s.match(/\[(\d{1,3}(?:\.\d{1,3}){3})\]/);
  if (bracket) return bracket[1];
  const bare = s.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
  return bare ? bare[1] : null;
}

function extractHost(re: RegExp, s: string): string | null {
  const m = s.match(re);
  return m ? m[1].trim().replace(/[;()]+$/, "") : null;
}

function parseHopDate(s: string): string | null {
  // The date follows the last ";" in a Received header.
  const semi = s.lastIndexOf(";");
  if (semi === -1) return null;
  const d = new Date(s.slice(semi + 1).trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function traceEmail(raw: string): Promise<EmailTrace> {
  // Only look at the header block (before the first blank line).
  const headerBlock = raw.split(/\r?\n\r?\n/)[0] ?? raw;
  const headers = unfold(headerBlock);

  // Received: headers are prepended, so the FIRST in the file is the LAST hop.
  // Reversing gives origin-first order.
  const received = headers.filter((h) => /^Received:/i.test(h)).reverse();

  const rawHops = received.map((h, i) => {
    const from = extractHost(/from\s+([^\s;]+)/i, h);
    const by = extractHost(/\bby\s+([^\s;]+)/i, h);
    const ip = extractIp(h);
    return { index: i, from, by, ip, timestamp: parseHopDate(h) };
  });

  // The true origin is the first hop whose IP is public.
  const originHop = rawHops.find((hop) => hop.ip && !isPrivateIp(hop.ip));
  const originIp = originHop?.ip ?? null;

  // Enrich all public hop IPs.
  const ips = rawHops
    .map((h) => h.ip)
    .filter((ip): ip is string => ip !== null && !isPrivateIp(ip));
  const enriched = await enrichIps(ips);

  const hops: EmailHop[] = rawHops.map((h) => ({
    ...h,
    info: h.ip ? enriched.get(h.ip) ?? null : null,
  }));

  const adversaryHops = hops.filter((h) => h.info?.adversary).length;
  const originCountry = originIp
    ? enriched.get(originIp)?.country ?? null
    : null;

  // ---- Authentication results --------------------------------------------
  const authLine =
    headers.find((h) => /^Authentication-Results:/i.test(h)) ?? "";
  const receivedSpf = headers.find((h) => /^Received-SPF:/i.test(h)) ?? "";

  const pick = (re: RegExp, ...sources: string[]): string | null => {
    for (const src of sources) {
      const m = src.match(re);
      if (m) return m[1].toLowerCase();
    }
    return null;
  };

  const spf =
    pick(/spf=(\w+)/i, authLine, receivedSpf) ??
    (/pass/i.test(receivedSpf) ? "pass" : null);
  const dkim = pick(/dkim=(\w+)/i, authLine);
  const dmarc = pick(/dmarc=(\w+)/i, authLine);

  // ---- Spoofing verdict ---------------------------------------------------
  const reasons: string[] = [];
  let bad = 0;
  let checks = 0;
  for (const [name, val] of [
    ["SPF", spf],
    ["DKIM", dkim],
    ["DMARC", dmarc],
  ] as const) {
    if (val === null) continue;
    checks++;
    if (/(fail|softfail|none|temperror|permerror)/.test(val)) {
      bad++;
      reasons.push(`${name}=${val}`);
    }
  }

  let spoofingVerdict: EmailTrace["spoofingVerdict"];
  if (checks === 0) spoofingVerdict = "Unknown";
  else if (dmarc === "fail" || bad >= 2) spoofingVerdict = "Likely spoofed";
  else if (bad === 1) spoofingVerdict = "Suspicious";
  else spoofingVerdict = "Likely authentic";

  if (spoofingVerdict === "Likely authentic" && reasons.length === 0)
    reasons.push("SPF/DKIM/DMARC checks passed");

  return {
    hops,
    originIp,
    originCountry,
    spf,
    dkim,
    dmarc,
    spoofingVerdict,
    spoofingReasons: reasons,
    adversaryHops,
  };
}
