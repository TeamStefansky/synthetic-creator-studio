// DNS-over-HTTPS lookups via Google's resolver.

import { getJson } from "./http";

type DnsType = "A" | "AAAA" | "MX" | "NS" | "TXT";

interface DohAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}
interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

export interface DnsRecords {
  a: string[];
  mx: string[];
  ns: string[];
  txt: string[];
}

async function query(domain: string, type: DnsType): Promise<string[]> {
  const data = await getJson<DohResponse>(
    `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`,
    { headers: { Accept: "application/dns-json" } },
  );
  if (!data?.Answer) return [];
  return data.Answer.map((a) => a.data.replace(/^"|"$/g, "").trim());
}

export async function lookupDns(domain: string): Promise<DnsRecords> {
  const [a, mx, ns, txt] = await Promise.all([
    query(domain, "A"),
    query(domain, "MX"),
    query(domain, "NS"),
    query(domain, "TXT"),
  ]);
  return { a, mx, ns, txt };
}

/** Extract the first A-record IP, if any. */
export function firstIp(records: DnsRecords): string | undefined {
  return records.a.find((r) => /^\d+\.\d+\.\d+\.\d+$/.test(r));
}

/** Parse MX "priority host" strings into bare hostnames. */
export function mxHosts(records: DnsRecords): string[] {
  return records.mx
    .map((r) => r.split(/\s+/).pop() || r)
    .map((h) => h.replace(/\.$/, "").toLowerCase());
}

/** Mail-auth flags from TXT records (DKIM is selector-specific; best-effort). */
export function mailAuthFromTxt(txt: string[]): {
  spf: boolean;
  dmarc: boolean;
} {
  const spf = txt.some((t) => /v=spf1/i.test(t));
  const dmarc = txt.some((t) => /v=DMARC1/i.test(t));
  return { spf, dmarc };
}
