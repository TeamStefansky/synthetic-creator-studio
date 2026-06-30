// Main orchestration endpoint. Runs every lookup in parallel with
// Promise.allSettled so a single failed source never breaks the report.

import { NextRequest, NextResponse } from "next/server";
import { normalizeUrl } from "@/lib/normalizeUrl";
import { cacheGet, cacheSet } from "@/lib/cache";
import { lookupDns, firstIp, mxHosts, mailAuthFromTxt } from "@/lib/dns";
import { lookupRdap } from "@/lib/rdap";
import { lookupHosting } from "@/lib/ip";
import { lookupSsl } from "@/lib/ssl";
import { lookupArchive } from "@/lib/archive";
import { lookupFactChecks } from "@/lib/factcheck";
import { reverseIp } from "@/lib/reverseip";
import { fetchPage } from "@/lib/page-fetch";
import { fingerprint, extractArticle, extractSeo } from "@/lib/fingerprint";
import { assessAuthority } from "@/lib/authority";
import { buildGeography } from "@/lib/geo";
import { matchReputation } from "@/lib/reputation";
import { analyzeContent } from "@/lib/content-analysis";
import { scoreReport } from "@/lib/scoring";
import { buildNetwork } from "@/lib/network";
import { tracePropagation } from "@/lib/propagation";
import { assessCoordination } from "@/lib/coordination";
import type { Report, Maybe } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function ok<T>(value: T): Maybe<T> {
  return { status: "ok", value };
}
function unavailable<T>(error?: string): Maybe<T> {
  return { status: "unavailable", error };
}

function settled<T>(r: PromiseSettledResult<T>): T | undefined {
  return r.status === "fulfilled" ? r.value : undefined;
}

export async function POST(req: NextRequest) {
  let url: string;
  try {
    const body = await req.json();
    url = body.url;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let norm;
  try {
    norm = normalizeUrl(url);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Invalid URL" }, { status: 400 });
  }
  const { domain } = norm;

  // 24h cache by domain.
  const cached = await cacheGet<Report>(`report:${domain}`);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  // Phase 1: lookups that don't need the resolved IP or the page HTML.
  const [dnsRes, rdapRes, sslRes, archiveRes, factRes, pageRes] =
    await Promise.allSettled([
      lookupDns(domain),
      lookupRdap(domain),
      lookupSsl(domain),
      lookupArchive(domain),
      lookupFactChecks(domain),
      fetchPage(norm.url),
    ]);

  const dns = settled(dnsRes);
  const rdap = settled(rdapRes);
  const ssl = settled(sslRes);
  const archive = settled(archiveRes);
  const factChecks = settled(factRes) || [];
  const page = settled(pageRes);

  const ip = dns ? firstIp(dns) : undefined;

  // Phase 2: lookups depending on the IP / HTML.
  const [hostRes, revRes] = await Promise.allSettled([
    lookupHosting(ip),
    reverseIp(ip),
  ]);
  const hosting = settled(hostRes);
  const reverseNeighbors = settled(revRes) || [];

  // Fingerprint + article extraction from the fetched HTML.
  const tech =
    page && page.html
      ? fingerprint(page.html, page.headers, domain)
      : undefined;
  const seo = page && page.html ? extractSeo(page.html) : undefined;
  const article = page && page.html ? extractArticle(page.html) : { text: "", quote: "" };

  // Authority / longevity (legitimacy independent of the seed list).
  const authority = await assessAuthority(domain, rdap, archive).catch(() => undefined);

  // A successful HTTPS fetch is a more reliable HTTPS signal than crt.sh.
  const pageHttpsOk = !!page?.ok && (page.finalUrl || norm.url).startsWith("https://");

  // Mail info from DNS TXT + MX + emails in page.
  const mail = dns
    ? {
        mxProviders: mxHosts(dns),
        ...mailAuthFromTxt(dns.txt),
        dkim: dns.txt.some((t) => /v=DKIM1/i.test(t)), // best-effort
        emailsFound: tech?.emails || [],
      }
    : undefined;

  // Content analysis (Anthropic; graceful when no key).
  const content = await analyzeContent(article.text);

  // Sibling domains for reputation guilt-by-infra + propagation overlap.
  const siblingDomains = [
    ...(ssl?.sanDomains || []),
    ...reverseNeighbors,
  ];
  const reputation = matchReputation(domain, factChecks, siblingDomains);

  const infrastructure = {
    domain: rdap ? ok(rdap) : unavailable<any>("RDAP unavailable"),
    hosting: hosting?.ip ? ok(hosting) : unavailable<any>("Hosting/IP unavailable"),
    mail: mail ? ok(mail) : unavailable<any>("Mail/DNS unavailable"),
    ssl: ssl ? ok(ssl) : unavailable<any>("SSL/crt.sh unavailable"),
    tech: tech ? ok(tech) : unavailable<any>("Page fetch/fingerprint unavailable"),
    archive: archive ? ok(archive) : unavailable<any>("Wayback unavailable"),
    seo: seo ? ok(seo) : unavailable<any>("Page fetch unavailable"),
    authority: authority ? ok(authority) : unavailable<any>("Authority signals unavailable"),
  };

  const risk = scoreReport({ domain, infrastructure, reputation, content, siblingDomains, pageHttpsOk });
  const network = buildNetwork({ domain, infrastructure, reverseIpNeighbors: reverseNeighbors });

  // Geographic origin: server + registrant + mail (MX) + DNS (NS) countries.
  const geography = dns
    ? await buildGeography(hosting, rdap?.registrantCountry, mxHosts(dns), dns.ns).catch(() => undefined)
    : undefined;

  // Open-web propagation (optional) + coordination indicator.
  const propagation = await tracePropagation(article.quote, siblingDomains).catch(() => undefined);
  const coordination = assessCoordination({ network, propagation });

  const report: Report = {
    url: norm.url,
    domain,
    fetchedAt: new Date().toISOString(),
    finalUrl: page?.finalUrl,
    infrastructure,
    reputation,
    contentAnalysis: content,
    risk,
    network,
    geography,
    propagation,
    coordination,
  };

  // Cache the report for 24h — but NOT when content analysis failed despite a
  // configured key (e.g. out of credits / rate-limited). That keeps a transient
  // failure from being pinned for 24h, so a retry works once it's resolved.
  const contentTransientlyFailed =
    !!process.env.ANTHROPIC_API_KEY && !content.available;
  if (!contentTransientlyFailed) {
    await cacheSet(`report:${domain}`, report);
  }
  return NextResponse.json(report);
}
