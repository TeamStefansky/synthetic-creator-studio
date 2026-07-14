// DNS lookups via Google's DNS-over-HTTPS JSON API.
// Returns A, MX, NS and TXT records plus derived mail-auth flags.

import { getJson } from "./httpClient";
import type { MailInfo } from "./types";

interface DohAnswer {
  name: string;
  type: number;
  data: string;
}
interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

const DOH = "https://dns.google/resolve";

async function query(domain: string, type: string): Promise<string[]> {
  const url = `${DOH}?name=${encodeURIComponent(domain)}&type=${type}`;
  const json = await getJson<DohResponse>(url, {
    headers: { Accept: "application/dns-json" },
  });
  if (!json?.Answer) return [];
  return json.Answer.map((a) => a.data.trim());
}

export interface DnsResult {
  a: string[];
  mx: string[];
  ns: string[];
  txt: string[];
}

/** Resolve the core record types in parallel. */
export async function lookupDns(domain: string): Promise<DnsResult> {
  const [a, mx, ns, txt] = await Promise.all([
    query(domain, "A"),
    query(domain, "MX"),
    query(domain, "NS"),
    query(domain, "TXT"),
  ]);
  return { a, mx, ns, txt };
}

/** Guess a human-friendly mail provider name from MX hostnames. */
function guessMxProvider(mx: string[]): string | null {
  if (mx.length === 0) return null;
  const joined = mx.join(" ").toLowerCase();
  if (joined.includes("google") || joined.includes("googlemail"))
    return "Google Workspace";
  if (joined.includes("outlook") || joined.includes("microsoft"))
    return "Microsoft 365";
  if (joined.includes("zoho")) return "Zoho Mail";
  if (joined.includes("protonmail") || joined.includes("proton.me"))
    return "Proton Mail";
  if (joined.includes("yandex")) return "Yandex";
  if (joined.includes("mailgun")) return "Mailgun";
  if (joined.includes("sendgrid")) return "SendGrid";
  // Fall back to the lowest-priority MX host root.
  const first = mx[0].replace(/^\d+\s+/, "").replace(/\.$/, "");
  return first || null;
}

/** Build the MailInfo block from DNS + emails scraped elsewhere. */
export function buildMailInfo(dns: DnsResult, emailsFound: string[]): MailInfo {
  const txtJoined = dns.txt.join(" ").toLowerCase();
  return {
    mxProvider: guessMxProvider(dns.mx),
    mxRecords: dns.mx.map((m) => m.replace(/^\d+\s+/, "").replace(/\.$/, "")),
    hasSpf: txtJoined.includes("v=spf1"),
    // DKIM selectors aren't enumerable from generic TXT; treat as unknown/false
    // unless a DKIM hint is present in TXT (rare but possible).
    hasDkim: txtJoined.includes("dkim1") || txtJoined.includes("v=dkim1"),
    hasDmarc: txtJoined.includes("v=dmarc1"),
    emailsFound,
  };
}
