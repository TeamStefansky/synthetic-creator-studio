// P0 discovery fixtures — representative *slices* of each tool's real output,
// carrying only the evidence-bearing fields the P1 adapters will project into
// EvidenceItem[]. Not full type instances (the adapters read defensively); these
// document the shapes and drive per-adapter unit tests. Test-only, not production.

// --- Site Report (lib/types.ts Report) — evidence-bearing slice ---------------
export const siteReportFixture = {
  tool: "site",
  url: "https://techforpalestine.org/",
  domain: "techforpalestine.org",
  fetchedAt: "2026-07-20T10:00:00Z",
  infrastructure: {
    domain: { status: "ok", value: { registrar: "NameCheap, Inc.", createdAt: "2023-11-02T00:00:00Z", privacyProtected: true } },
    hosting: { status: "ok", value: { ip: "104.20.28.231", asn: "AS13335", asnOrg: "Cloudflare", cdn: "Cloudflare", cdnMasksOrigin: true } },
    ssl: { status: "ok", value: { issuer: "Google Trust Services", validFrom: "2026-05-01T00:00:00Z", sanDomains: ["techforpalestine.org", "www.techforpalestine.org"], certCount: 3 } },
    tech: { status: "ok", value: { gaIds: ["G-ABC123XYZ"], adsenseIds: [], frameworks: [], adNetworks: [], trackers: [], emails: [], hasAbout: true, hasContact: true, hasAuthor: false, hasCorrections: false } },
    archive: { status: "ok", value: { firstSeen: "2023-11-10T00:00:00Z", snapshotCount: 142 } },
  },
  originTrace: {
    available: true, cdn: "Cloudflare", edgeIp: "104.20.28.231", edgeCountry: "US",
    likelyOrigin: { ip: "89.147.110.100", country: "IS", asnOrg: "1984 ehf" },
    candidates: [{ ip: "89.147.110.100", country: "IS", asnOrg: "1984 ehf", source: "subdomain dev.techforpalestine.org", isCdn: false }],
    methods: ["subdomain probe", "MX"], note: "1 non-CDN IP leaked via DNS.",
  },
  geography: {
    server: { host: "104.20.28.231", ip: "104.20.28.231", country: "US", asnOrg: "Cloudflare", cdn: "Cloudflare", masked: true },
    dns: [{ host: "augustus.ns.cloudflare.com", country: "US", asnOrg: "Cloudflare" }],
    mail: [{ host: "smtp.google.com", country: "US", asnOrg: "Google" }],
    countries: ["US", "IS"],
  },
} as const;

// A second site sharing the SAME niche host operator via its nameserver (the 1984 link).
export const siteReportFixtureB = {
  tool: "site",
  url: "https://www.shovrimshtika.org/",
  domain: "shovrimshtika.org",
  fetchedAt: "2026-07-20T10:05:00Z",
  infrastructure: {
    domain: { status: "ok", value: { registrar: "PDR Ltd. d/b/a PublicDomainRegistry.com", createdAt: "2015-03-01T00:00:00Z", privacyProtected: false } },
    hosting: { status: "ok", value: { ip: "142.250.0.1", asnOrg: "Google Cloud CDN", cdn: "Google Cloud CDN", cdnMasksOrigin: true } },
    ssl: { status: "ok", value: { sanDomains: ["shovrimshtika.org"], certCount: 1 } },
    tech: { status: "ok", value: { gaIds: [], adsenseIds: [] } },
    archive: { status: "ok", value: { firstSeen: "2015-04-01T00:00:00Z", snapshotCount: 900 } },
  },
  geography: {
    server: { host: "142.250.0.1", country: "US", asnOrg: "Google Cloud CDN", cdn: "Google Cloud CDN", masked: true },
    dns: [{ host: "ns0.1984.is", country: "IS", asnOrg: "1984 ehf" }, { host: "ns1.virtualroad.info", country: "NO" }],
    mail: [{ host: "aspmx.l.google.com", country: "US", asnOrg: "Google" }],
    countries: ["US", "IS", "NO"],
  },
} as const;

// --- Post Check (lib/types.ts PostCheckResult) — self-reported byline is T3 ---
export const postCheckFixture = {
  tool: "post",
  input: "https://x.com/example/status/1",
  available: true, verdict: "Unverified", confidence: "Low",
  summary: "Claim not independently corroborated.",
  claims: [{ claim: "X happened on the 14th", verdict: "unverified", assessment: "no third-party record" }],
  sources: [{ title: "example.com report", url: "https://example.com/a" }],
  note: "byline datePublished 2026-07-14 (self-reported).",
} as const;

// --- Log Analyzer (lib/types.ts LogAnalysisResult) — third-party server log T1 -
export const logAnalysisFixture = {
  tool: "logs",
  totalRequests: 1200, uniqueIps: 3, datacenterPct: 66,
  topIps: [
    { ip: "89.147.110.100", requests: 800, enrichment: { ip: "89.147.110.100", country: "IS", asn: "AS9009", asnOrg: "1984 ehf", hostingType: "datacenter", isAdversary: false }, userAgents: ["curl/8"], flags: ["datacenter_asn"], reasons: [], contentPath: [{ path: "/login", timestamp: "2026-07-19T22:01:00Z", status: 200 }] },
  ],
  timeline: [{ bucket: "2026-07-19T22:00:00Z", requests: 800, burst: true }],
  note: "own server access log.",
} as const;

// --- Email Tracer (lib/types.ts EmailTraceResult) — Received headers T1-ish ---
export const emailTraceFixture = {
  tool: "email",
  originIp: "198.51.100.7", originCountry: "DE", originIsAdversary: false,
  hops: [{ index: 0, raw: "Received: from mail.sender.org (198.51.100.7)", by: "mx.google.com", ip: "198.51.100.7", timestamp: "2026-07-18T09:00:00Z", enrichment: { ip: "198.51.100.7", country: "DE", asnOrg: "Hetzner", hostingType: "datacenter", isAdversary: false } }],
  auth: { spf: "pass", dkim: "pass", dmarc: "pass", spoofingLikely: false, verdict: "aligned" },
  domain: "sender.org",
} as const;

// --- Link Board (lib/board/types.ts BoardResult) — calibrated pair edges ------
export const boardResultFixture = {
  tool: "linkboard",
  entities: ["a.com", "b.com", "c.com"],
  rubricVersion: "board-overlap-v1",
  edges: [
    { a: "a.com", b: "b.com", strength: "High", overlapCount: 1, items: [{ kind: "ga_id", display: "G-SHARED99", strength: "High", source: "tech", countsToward: true, alternative: "the same tag can be copied onto unrelated sites." }] },
    { a: "b.com", b: "c.com", strength: "Low", overlapCount: 1, items: [{ kind: "asn", display: "AS13335 Cloudflare", strength: "Low", source: "hosting", countsToward: false, alternative: "an ASN spans thousands of unrelated customers." }] },
  ],
  fingerprints: [{ entity: "a.com", artifactCount: 12, errors: [], authority: 4 }],
} as const;

export const ALL_FIXTURES = {
  site: siteReportFixture, siteB: siteReportFixtureB, post: postCheckFixture,
  logs: logAnalysisFixture, email: emailTraceFixture, board: boardResultFixture,
} as const;
