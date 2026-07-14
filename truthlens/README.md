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

## Origin & Attribution tools

Beyond the site report, TruthLens includes an **Attribution Tools** section
(top nav) for tracing content to an origin — including hostile states or bot
farms — through legitimate means only. It never fetches anyone else's private
logs.

### Log Analyzer (`/tools/logs`, `POST /api/logs`)

Upload or paste an **access log you own or are authorized to inspect**
(Apache/Nginx combined or generic CSV — auto-detected). For each unique client
IP it enriches geo/ASN, classifies **residential vs datacenter/hosting** (a bot
signal), and flags:

- adversary-country origins (per your configured list),
- datacenter/hosting ASNs (likely automation, not real readers),
- the same User-Agent across many distinct IPs (bot-farm signature),
- high request-rate / synchronized bursts and sequential path-scanning,
- the real client behind a proxy via `X-Forwarded-For` when present.

It reconstructs each visitor's **content path** (ordered URLs + timestamps) and
shows summary cards, a country breakdown, a request-volume timeline (bursts
highlighted), and a sortable top-IP table.

### Email Header Tracer (`/tools/email`, `POST /api/email-trace`)

Paste the **raw source of an email you received**. TruthLens parses every
`Received:` header, reconstructs the delivery hops **origin-first**, infers the
true originating external IP + country, enriches each hop, parses
SPF/DKIM/DMARC, and returns a spoofing verdict.

### Adversary-origin flagging (site report)

`data/adversary-countries.json` is an **operator-editable, empty-by-default**
ISO-code list — TruthLens ships **no** political judgments. When you populate
it, the site report flags a server/registrant country that matches, and adds an
evidence item. **CDN caveat:** if the site sits behind a CDN (Cloudflare,
Akamai, Fastly, CloudFront…), the true origin is masked, so TruthLens labels the
location "CDN edge — true origin masked" and suppresses origin-country flagging
rather than assert a country with false confidence.

### Content-propagation tracer (site report)

Takes a distinctive sentence from the article and searches the **open web** for
other publishers to find where the content originated (earliest publisher =
likely origin), and flags **coordinated amplification** when republishers share
the target's operator infrastructure. Uses `ANTHROPIC_API_KEY` with web search;
degrades gracefully when unavailable.

### Coordination / bot-farm signal (site report)

Combines already-computed signals — shared-infrastructure siblings, shared
identifiers with known-fake sites, datacenter hosting, fresh registration — into
a **Low / Medium / High** coordination likelihood with itemized evidence.

> **Attribution honesty.** There is no legitimate way to read a stranger's
> private server logs — you analyze your own logs, email headers you possess,
> and publicly observable infrastructure. Geolocation is approximate; CDNs, VPNs
> and Tor mask true origin (the tool labels this rather than guessing). The
> adversary list is your policy, not ours. Attribution is probabilistic —
> indicators with evidence, never proof.

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
