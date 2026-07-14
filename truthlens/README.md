# TruthLens

**Detect likely fake-news websites and expose the infrastructure behind them.**

Paste a URL and TruthLens returns a two-part report:

1. **Infrastructure exposure** — who is behind the site: domain registration,
   hosting/servers, mail, SSL certificates, tech stack, archive history, and
   connected "sibling" domains.
2. **Credibility risk rating** — a clear badge (HIGH RISK / UNKNOWN / LIKELY
   LEGITIMATE), a 0–100 risk score, a confidence level, and a transparent,
   itemized list of every signal that produced the score.

> **Framing.** We cannot automatically determine truth. TruthLens surfaces
> verifiable infrastructure facts and computes a *risk* score from observable
> signals. It always shows the evidence, never just a verdict. **"UNKNOWN" is a
> valid and common result.** Everything is framed as risk indicators, not
> accusations.

---

## Quick start

```bash
cd truthlens
npm install
cp .env.example .env.local   # optional: add API keys
npm run dev
```

Open <http://localhost:3000>, paste a URL, and get a full report.

The infrastructure exposure layer (DNS / WHOIS / IP / SSL / archive / tech /
network graph) works **out of the box** on free public endpoints — no keys
required.

## Environment variables

Copy `.env.example` to `.env.local` and fill in what you have. All are optional
except where noted for a specific feature:

| Variable | Required for | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Content-analysis layer | Without it, the AI media-literacy analysis is skipped gracefully and confidence is lowered. The rest of the report still works. |
| `GOOGLE_FACTCHECK_KEY` | Fact-check reputation signal | Enables Google Fact Check Tools lookups. |
| `IPINFO_TOKEN` | Richer / higher-limit IP data | ipinfo.io works tokenless at a lower rate limit. |

Keys are read with `process.env` inside server routes only and never reach the
client.

## How it works

`POST /api/analyze { url }` orchestrates every lookup in parallel with
`Promise.allSettled`, so one failed source never breaks the report (missing
pieces render as **"Unavailable"**). Results are cached for 24h (in-memory +
on-disk JSON under `.cache/`, keyed by domain) to respect the free APIs'
rate limits.

### Data sources (all free except Anthropic)

| Source | Endpoint |
|---|---|
| DNS (A/MX/NS/TXT) | `dns.google/resolve` (DNS-over-HTTPS) |
| WHOIS / RDAP | `rdap.org/domain/{domain}` |
| IP / ASN / geo | `ipinfo.io/{ip}/json` |
| SSL certs + SAN | `crt.sh/?q={domain}&output=json` |
| Archive history | `web.archive.org/cdx/search/cdx` |
| Fact checks | Google Fact Check Tools API |
| Reverse IP (optional) | `api.hackertarget.com/reverseiplookup` |
| Content analysis | Anthropic API (`claude-sonnet-4-6`) |

### Risk scoring (transparent + weighted)

Baseline `40`, clamped `0–100`, **higher = higher risk**. Every applied signal
is recorded with its `+/-` impact and a human-readable explanation. Bands:

- `0–35` → **LIKELY LEGITIMATE** (green)
- `36–65` → **UNKNOWN** (yellow)
- `66–100` → **HIGH RISK** (red)

Confidence is derived from how many signal categories returned real data; a
decisive reputation or fact-check match forces **High**. See
`lib/scoring.ts` for the exact weights.

### Operator network graph

The headline feature. The target domain is linked to sibling domains that share
the **same IP**, a **Google Analytics ID**, an **AdSense ID**, or membership in
the **same SSL certificate** (plus optional reverse-IP neighbors). Nodes that
match the known-fake seed list are colored red. Rendered with
`react-force-graph-2d`, with a simplified, touch-friendly layout on mobile.

## Project structure

```
app/
  page.tsx                landing page (URL input)
  report/page.tsx         report page (calls /api/analyze, renders)
  api/analyze/route.ts    orchestration endpoint
lib/                      one module per data source + scoring/network/cache
data/                     known-credible.json / known-fake.json seed lists
components/               UI components
```

## Honest notes

- **Reputation lists are seeds.** There is no perfect free "is this fake" API,
  so `data/known-credible.json` and `data/known-fake.json` ship small seed
  lists for the strongest signal. Expand them or wire in a paid reputation feed
  for production. Inclusion on the fake list is a documented *indicator*, not a
  legal accusation.
- **Free APIs rate-limit.** crt.sh, HackerTarget and the public DNS/RDAP
  endpoints throttle under heavy use — that's why caching is built in.
- **Keep the framing.** The risk score is an indicator backed by evidence, not
  a verdict. That's deliberate: it keeps the tool both honest and legally safer.
