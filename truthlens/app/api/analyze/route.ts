// Main orchestration endpoint.
// POST { url } -> full Report. Runs every lookup in parallel with
// Promise.allSettled so a single failed source never breaks the report.

import { NextRequest, NextResponse } from "next/server";
import { normalizeUrl } from "@/lib/normalizeUrl";
import { getCached, setCached } from "@/lib/cache";
import { lookupDns, buildMailInfo } from "@/lib/dns";
import { lookupRdap } from "@/lib/rdap";
import { lookupIp } from "@/lib/ip";
import { lookupSsl } from "@/lib/ssl";
import { lookupArchive } from "@/lib/archive";
import { lookupFactChecks } from "@/lib/factcheck";
import { reverseIp } from "@/lib/reverseip";
import { fetchPage } from "@/lib/page-fetch";
import { fingerprint } from "@/lib/fingerprint";
import {
  buildReputation,
  detectLookalike,
} from "@/lib/reputation";
import { analyzeContent } from "@/lib/content-analysis";
import { computeRisk } from "@/lib/scoring";
import { buildNetwork } from "@/lib/network";
import type {
  ArchiveInfo,
  DomainInfo,
  HostingInfo,
  Report,
  SslInfo,
  TechInfo,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolve a settled promise to its value, or a fallback on rejection. */
function settled<T>(
  result: PromiseSettledResult<T>,
  fallback: T
): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

const EMPTY_DOMAIN: DomainInfo = {
  registrar: null,
  createdAt: null,
  expiresAt: null,
  updatedAt: null,
  registrantOrg: null,
  registrantCountry: null,
  privacyProtected: false,
  ageDays: null,
  nameservers: [],
};

const EMPTY_HOSTING: HostingInfo = {
  ip: null,
  asn: null,
  org: null,
  city: null,
  region: null,
  country: null,
  hostname: null,
};

const EMPTY_SSL: SslInfo = {
  issuer: null,
  validFrom: null,
  validTo: null,
  sanDomains: [],
  certCount: 0,
  validHttps: false,
};

const EMPTY_TECH: TechInfo = {
  cms: null,
  server: null,
  frameworks: [],
  adNetworks: [],
  trackers: [],
  gaIds: [],
  adsenseIds: [],
  hasAbout: false,
  hasContact: false,
  hasAuthors: false,
  hasCorrections: false,
};

const EMPTY_ARCHIVE: ArchiveInfo = { firstSeen: null, snapshotCount: 0 };

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let normalized;
  try {
    normalized = normalizeUrl(body.url ?? "");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid URL" },
      { status: 400 }
    );
  }
  const { url, domain } = normalized;

  // ---- Cache --------------------------------------------------------------
  const cached = await getCached(domain);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  // ---- Parallel lookups ---------------------------------------------------
  // page-fetch and crt.sh and others run together; ip depends on DNS A record,
  // so we kick DNS first but still parallelize the rest.
  const dnsPromise = lookupDns(domain);

  const [pageRes, sslRes, archiveRes, rdapRes, factRes, dnsResSettled] =
    await Promise.allSettled([
      fetchPage(url),
      // crt.sh certs (validHttps filled later from page fetch).
      lookupSsl(domain, false),
      lookupArchive(domain),
      lookupRdap(domain),
      lookupFactChecks(domain),
      dnsPromise,
    ]);

  const dns = settled(dnsResSettled, { a: [], mx: [], ns: [], txt: [] });
  const page = settled(pageRes, null);

  // IP lookup depends on the resolved A record.
  const firstIp = dns.a.find((v) => /^\d{1,3}(\.\d{1,3}){3}$/.test(v)) ?? null;
  const [ipResSettled, reverseResSettled] = await Promise.allSettled([
    firstIp ? lookupIp(firstIp) : Promise.resolve<HostingInfo | null>(null),
    firstIp ? reverseIp(firstIp) : Promise.resolve<string[]>([]),
  ]);

  const hosting = settled(ipResSettled, null) ?? EMPTY_HOSTING;
  const reverseNeighbors = settled(reverseResSettled, []);

  // ---- Fingerprint the fetched HTML --------------------------------------
  const fp = page
    ? fingerprint(page.html, page.headers)
    : { tech: EMPTY_TECH, emails: [], articleText: "" };

  // ---- Assemble infrastructure -------------------------------------------
  const ssl = settled(sslRes, null) ?? EMPTY_SSL;
  ssl.validHttps = page?.validHttps ?? false;

  const infrastructure = {
    domain: settled(rdapRes, null) ?? EMPTY_DOMAIN,
    hosting,
    mail: buildMailInfo(dns, fp.emails),
    ssl,
    tech: fp.tech,
    archive: settled(archiveRes, null) ?? EMPTY_ARCHIVE,
  };

  // ---- Reputation + lookalike --------------------------------------------
  const factChecks = settled(factRes, []);
  const reputation = buildReputation(domain, factChecks);
  const lookalike = detectLookalike(domain);

  // ---- Network graph ------------------------------------------------------
  const { network, sharesWithFake } = buildNetwork({
    domain,
    infra: infrastructure,
    reverseIpNeighbors: reverseNeighbors,
  });

  // ---- Content analysis (Anthropic) --------------------------------------
  const contentAnalysis = await analyzeContent(fp.articleText);

  // ---- Risk scoring -------------------------------------------------------
  const risk = computeRisk({
    infra: infrastructure,
    reputation,
    content: contentAnalysis,
    lookalike,
    sharesWithFake,
  });

  const report: Report = {
    url,
    domain,
    fetchedAt: new Date().toISOString(),
    infrastructure,
    reputation,
    contentAnalysis,
    risk,
    network,
  };

  await setCached(domain, report);
  return NextResponse.json(report);
}
