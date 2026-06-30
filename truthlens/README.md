# TruthLens

A decision-support tool that detects **likely** fake-news websites and exposes
the infrastructure behind them. Paste a URL and get:

1. **Infrastructure exposure** — domain registration, hosting/IP/ASN, mail,
   SSL certificates (and the sibling domains on them), tech stack, and archive
   history.
2. **Credibility risk rating** — a badge (LIKELY LEGITIMATE / UNKNOWN / HIGH
   RISK), a 0–100 score, a confidence level, and a **transparent, itemized list
   of every signal** that produced the score.

Plus an **Attribution Tools** suite (log analyzer, email-header tracer) and an
operator-network graph that links a site to siblings via shared IP, GA/AdSense
IDs, and SSL SANs.

> **Framing — read this first.** We cannot automatically determine truth. We
> surface verifiable infrastructure facts and compute a *risk* score from
> observable signals. The product always shows the **evidence**, never just a
> verdict. **"Unknown" is a valid and common result.** Everything is framed as
> risk indicators, not accusations.

This app lives inside the `synthetic-creator-studio` monorepo as a standalone
Next.js subproject under `truthlens/`. It is independent of the studio backend.

---

## Quick start

```bash
cd truthlens
npm install
cp .env.example .env.local   # optional: fill in keys
npm run dev                  # http://localhost:3000
```

The app **runs out of the box on free public endpoints** — no keys required for
the infrastructure exposure, scoring, and network graph. Keys only unlock
optional layers (see below).

## Deploy a public instance

TruthLens is a server app (analysis runs in API routes), so it needs a Node host
— a static export won't work for the live features.

### Vercel (recommended for Next.js)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FTeamStefansky%2Fsynthetic-creator-studio&root-directory=truthlens&project-name=truthlens&repository-name=truthlens)

The button pre-sets the **root directory to `truthlens`** (the app lives in a
subdirectory). Add any optional keys as Environment Variables in the Vercel
project settings, then deploy — you'll get a public `*.vercel.app` URL.

### Render (Docker blueprint)

The repo's root [`render.yaml`](../render.yaml) includes a `truthlens` web
service (Docker, `rootDir: truthlens`). In Render: **New + → Blueprint → point at
this repo/branch**. Set the optional keys (marked `sync: false`) in the
dashboard. A `truthlens/Dockerfile` (standalone Next.js output) is included for
any other container host too.

> Both paths run out of the box on free public APIs; keys only add the optional
> layers below.

## Environment variables

All optional — core features work without any of them.

| Var | Purpose | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Content-credibility analysis (Claude) **and** the open-web propagation tracer (`web_search`) | Content-analysis card skipped; confidence lower; propagation limited |
| `GOOGLE_FACTCHECK_KEY` | Google Fact Check Tools API | Fact-check layer skipped |
| `IPINFO_TOKEN` | Higher-accuracy / higher-limit IP geo & ASN | Falls back to free ip-api.com (throttled) |
| `SEARCH_API_KEY` | Reserved for an alternate web-search provider | Propagation relies on Claude `web_search` + Wayback |
| `IMAGE_SEARCH_KEY` | (paid) reverse-image origin tracing | Disabled |
| `SOCIAL_API_KEY` | (paid/limited) social amplification signals | Disabled |

## Data sources (free except Anthropic)

DNS-over-HTTPS (`dns.google`), RDAP (`rdap.org`), IP/ASN/geo (`ipinfo.io` →
`ip-api.com`), SSL/SAN (`crt.sh`), archive (`web.archive.org` CDX), fact checks
(Google Fact Check Tools), reverse IP (`hackertarget.com`, rate-limited). All
calls happen **server-side only** — keys never reach the client. Results are
cached on disk + in memory for 24h, keyed by domain, to respect rate limits.

## Architecture

```
truthlens/
├── app/
│   ├── page.tsx                 landing (URL input)
│   ├── report/page.tsx          report (calls /api/analyze)
│   ├── tools/logs/page.tsx      log analyzer UI
│   ├── tools/email/page.tsx     email-header tracer UI
│   └── api/
│       ├── analyze/route.ts     main orchestration
│       ├── logs/route.ts        log analysis
│       └── email-trace/route.ts email tracing
├── lib/                         one module per data source + scoring/network/
│                                cache + attribution libs (log-analyzer,
│                                email-trace, propagation, coordination)
├── data/                        known-credible / known-fake / adversary-countries
└── components/                  UI building blocks
```

### Scoring (transparent, weighted)

Baseline 40; higher = riskier; clamped 0–100. Each signal is pushed into the
evidence list with its `+/-` impact and a human-readable detail. Bands:
`0–35` legitimate · `36–65` unknown · `66–100` high risk. See `lib/scoring.ts`
for the exact weights.

## Attribution Tools

### Log Analyzer (`/tools/logs`)
Upload or paste an access log **you own or are authorized to inspect** (Apache/
Nginx combined or CSV). It enriches unique IPs (geo/ASN/PTR), flags adversary
countries, datacenter ASNs, reused User-Agents (bot-farm signature), high rate
and path-scanning, reconstructs each visitor's content path, and charts a
timeline with burst detection.

> **There is no third-party log access.** A site cannot read another site's
> private server logs from the outside; this tool only analyzes logs you
> already have.

### Email Header Tracer (`/tools/email`)
Paste raw email source you possess. Parses `Received:` hops bottom-to-top
(origin first), geolocates each hop, infers the true originating IP/country, and
reads `Authentication-Results` (SPF/DKIM/DMARC) for a spoofing verdict.

### Adversary-country policy
`data/adversary-countries.json` ships **empty** by design — no political
judgments are baked in. Add the ISO alpha-2 codes *you* consider higher-risk and
the tool will match against them (in the site report, logs, and email tracer).

## Honest limitations

- **Geolocation is approximate; CDNs/VPNs/Tor mask true origin.** When a CDN
  (Cloudflare/Akamai/Fastly/…) is detected, the report labels the location as
  "CDN edge — true origin masked" instead of asserting a country.
- **Reputation lists are seeds.** Expand `data/known-*.json` for stronger signals.
- **Reverse-image / social tracing need paid APIs** and are gated behind keys.
- **Attribution is probabilistic** — strong infra + propagation signals point to
  a *likely* origin, not proof. It is presented as indicators with evidence.
- **Free APIs rate-limit.** That's why everything is cached for 24h.
