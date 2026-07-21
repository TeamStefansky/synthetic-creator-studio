// Email header tracer. Parses raw email source the USER POSSESSES, reconstructs
// the Received: hop path bottom-to-top (origin first), enriches each hop IP,
// and evaluates SPF/DKIM/DMARC for a spoofing verdict.

import { enrichIp } from "./ip";
import type {
  EmailHop,
  EmailTraceResult,
  EmailAuthResult,
} from "./types";

const PRIVATE_IP_RE =
  /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

function isPublicIp(ip: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(ip) && !PRIVATE_IP_RE.test(ip);
}

/** Unfold header continuation lines (leading whitespace = continuation). */
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

function extractIp(s: string): string | undefined {
  // prefer bracketed [1.2.3.4], else any public IPv4
  const bracket = s.match(/\[(\d+\.\d+\.\d+\.\d+)\]/);
  if (bracket && isPublicIp(bracket[1])) return bracket[1];
  const all = s.match(/\d+\.\d+\.\d+\.\d+/g) || [];
  return all.find(isPublicIp);
}

function parseReceived(line: string, index: number): EmailHop {
  const body = line.replace(/^received:\s*/i, "");
  const from = body.match(/from\s+([^\s;]+)/i)?.[1];
  const by = body.match(/\bby\s+([^\s;]+)/i)?.[1];
  const ts = body.split(";").pop()?.trim();
  return {
    index,
    raw: body.trim().slice(0, 300),
    from,
    by,
    ip: extractIp(body),
    timestamp: ts && /\d{4}|\d{2}:\d{2}/.test(ts) ? ts : undefined,
  };
}

function parseAuth(headers: string[]): EmailAuthResult {
  const joined = headers.join("\n");
  const authResults =
    headers.find((h) => /^authentication-results:/i.test(h)) || "";
  const spfHeader = headers.find((h) => /^received-spf:/i.test(h)) || "";

  const grab = (re: RegExp, hay: string) => hay.match(re)?.[1]?.toLowerCase();
  const spf =
    grab(/spf=(\w+)/i, authResults) || grab(/^received-spf:\s*(\w+)/i, spfHeader);
  const dkim = grab(/dkim=(\w+)/i, authResults);
  const dmarc = grab(/dmarc=(\w+)/i, authResults);

  const fail = (v?: string) => v && /fail|softfail|none|temperror|permerror/.test(v);
  const spoofingLikely = !!(fail(spf) && fail(dkim)) || dmarc === "fail";

  let verdict: string;
  if (!spf && !dkim && !dmarc) verdict = "No authentication headers found - cannot assess spoofing.";
  else if (spoofingLikely) verdict = "Likely spoofed or unauthenticated - SPF/DKIM/DMARC failed.";
  else if (spf === "pass" || dkim === "pass") verdict = "Authentication checks passed - sender domain looks legitimate.";
  else verdict = "Mixed/partial authentication - treat with caution.";

  return { spf, dkim, dmarc, spoofingLikely, verdict };
}

export async function traceEmail(raw: string): Promise<EmailTraceResult> {
  const headers = unfold(raw);
  const receivedLines = headers.filter((h) => /^received:/i.test(h));

  // Received headers are prepended, so file order is newest-first.
  // Reverse to get origin-first (bottom-to-top).
  const hops: EmailHop[] = receivedLines
    .map((line, i) => parseReceived(line, i))
    .reverse()
    .map((hop, i) => ({ ...hop, index: i }));

  // Enrich hop IPs (cap to avoid hammering APIs).
  for (const hop of hops.slice(0, 15)) {
    if (hop.ip) hop.enrichment = await enrichIp(hop.ip);
  }

  // True origin = first hop with a public external IP.
  const origin = hops.find((h) => h.ip && isPublicIp(h.ip));
  const auth = parseAuth(headers);

  return {
    hops,
    originIp: origin?.ip,
    originCountry: origin?.enrichment?.country,
    originIsAdversary: !!origin?.enrichment?.isAdversary,
    auth,
  };
}
