# TruthLens — Influence-Detection Build Order & Integration Guide

This is the execution plan for the five feature prompts that together give TruthLens
foreign-influence-operation detection. Run them **in this order** — each depends on modules
the previous one creates. Every prompt already contains a P0 stop-gate that checks its
dependencies; this document exists so you don't hit those stops by surprise.

All work operates inside `CLAUDE.md`'s 8 non-negotiable rules. Nothing here overrides them.

---

## Dependency graph

```
[1] Influence-ops engine upgrade        (+ FARA/registries sub-part)
        │   builds: lib/similarity/*, lib/narrative/fingerprints.ts,
        │           lib/io-reference.ts, data/io-reference/*
        ▼
[2] Account Authenticity Check
        │   builds: lib/social/*, ProfileSnapshot, avatar perceptual-hasher,
        │           authenticity indicators
        │   uses:   lib/similarity/*, fingerprints.ts, cib/analyze.ts
        ▼
[3] Social Analyze  (category; entry point = a single profile link)
        │   builds: lib/social-analyze/{orchestrate,seed,report}.ts,
        │           Stage 1 (authenticity) + Stage 2 (seed) + Stage 3 (network expansion)
        │   uses:   everything from [1] and [2]
        ▼
[4] Influence-Network Map
            builds: lib/social-analyze/network-map.ts, extended graph types,
                    extended NetworkGraph.tsx
            uses:   Social Analyze's collected set + ProfileSnapshots
```

Model switch (`claude-fable-5`) is orthogonal — run it **first or last, once**, it touches
only the model constant. Recommended: run it first so all new code inherits the centralized
`LLM_MODEL` constant instead of a literal.

## Run order (files in this folder)

0. `truthlens-switch-model-to-fable5-prompt.md` — centralize + switch the model. One commit.
1. `truthlens-influence-ops-upgrade-prompt.md` — the engine upgrade (FARA/registries are req. 5.e inside it). Phases P0–P5.
2. `truthlens-account-authenticity-check-prompt.md` — the `lib/social/*` layer + ProfileSnapshot + avatar hasher. Phases P0–P4.
3. `truthlens-social-analyze-prompt.md` — the Social Analyze category. Phases P0–P3.
4. `truthlens-influence-network-map-prompt.md` — the network map. Phases P0–P3.

Run each prompt in its **own Claude Code session**, honor its per-phase stop-gates, one
commit per phase. After each full prompt, run `npm test && npx tsc --noEmit && npm run build`
before starting the next. If a P0 reports a missing dependency, you ran them out of order.

---

## Which APIs to connect (and what each one unlocks)

TruthLens is designed to run with **zero keys** and light up progressively. Connect keys in
priority order. Every unconnected source renders a visible "source not connected" state — it
never fakes data. Put keys in `.env.local` (server-side only; never sent to the client).

### Tier 0 — already working, connect nothing (keyless public endpoints)
These are wired and need no account:
- **GDELT DOC 2.0** — `api.gdeltproject.org` — global news/narrative mentions. (This is the
  free DOC API the code uses; it is NOT the paid "GDELT Cloud" product — don't confuse them.)
- **Bluesky public AppView** — `public.api.bsky.app` — post search + profiles, no key, no
  review; rate-limited (~5,000 points/hour). Your best keyless social signal, and the one
  source that lawfully exposes account `createdAt` for the creation-clustering fingerprint.
- **Hacker News (Algolia)**, **Reddit** (best-effort keyless; may throttle server IPs).
- **Internet Archive** Wayback + Save-Page-Now — keyless — evidence archival + origin dating.
- **RDAP / DNS / SSL / IP-geo primitives** — keyless — the whole infra/operator-graph side.

### Tier 1 — free keys, highest value-per-effort (connect these first)
- **`ANTHROPIC_API_KEY`** — THE priority key. Unlocks: claim/seed extraction, semantic +
  cross-language clustering, the `web_search` propagation tracer, and the deep-OSINT dossier.
  Without it, those degrade to keyword-only / "Not collected." Everything intelligent about
  narrative analysis runs through this. (This is also the key the model-switch prompt targets.)
- **News recall (all free tiers)** — widen how much of a narrative you catch:
  `GUARDIAN_API_KEY` (open-platform.theguardian.com), `NYT_API_KEY` (developer.nytimes.com),
  `GNEWS_API_KEY` (gnews.io), `NEWSAPI_KEY` (newsapi.org). Each is a free adapter already in
  `lib/narrative/sources.ts`; add the key and it connects.
- **`RSS_FEEDS`** — comma-separated feed URLs — free, and lets you pin specific outlets/regions.
- **OpenPageRank** (free) — domain authority signal for the legitimacy layer.

### Tier 2 — paid / gated, the per-platform social depth (connect when you need OBSERVED edges)
This is where "I can see the account data" lives. **Reality in 2026 (verified):**
- **X / Twitter API v2** — no free tier since Feb 2026; **pay-per-use** (~$0.005 per post
  read, ~$0.010 per user lookup, 2M-read/mo cap). This is the ONE platform that lawfully
  exposes real repost/reply/quote relationships → the **observed** edges in the network map
  and the follower/timeline data for authenticity. If you fund one paid platform, fund this.
- **Meta Graph (Instagram + Facebook)** — the app/token itself is free, but access is gated:
  you get rich data only for **accounts you own or that authorized your app** (Business/
  Creator), plus **Instagram business-discovery** (limited fields, by username, for
  business/creator accounts) and the public **Ad Library**. Arbitrary public-profile pull is
  ToS-prohibited. So for your `globalnews_he`-style seed, expect mostly "not connected"
  unless it's a discoverable business/creator account. Requires a Meta developer app + review.
- **TikTok** — **Research API** is academic/non-profit only (commercial ineligible); the
  **Business / Creator Search Insights** API gives creator-level follower ranges + avg
  engagement without per-creator OAuth. Pick the track you qualify for; scraping is ToS-barred.

> Hard rule (CLAUDE.md 5 & 7): connect only official platform APIs. **No scrapers, no
> unofficial reseller/wrapper APIs**, regardless of how much cheaper they look — they violate
> platform ToS and the product's ethics gates, and they poison reproducibility.

### Tier 3 — reference data (no live API; operator-maintained, cited)
- **FARA** — pull the **OpenSanctions `us_fara_filings`** daily bulk JSON (free) via
  `scripts/refresh-fara.ts`, OR the official **DOJ FARA eFile API v1** (`efile.fara.gov/api`,
  ~5 req/10s — throttle). Organizations only; drop person records on ingest.
- **State-media / documented-campaign domain lists** — seeded manually with a `sourceUrl` per
  entry; refreshed by the operator, never auto-scraped from third-party research.

### Minimum viable connect-list to detect an influence op end-to-end
`ANTHROPIC_API_KEY` (intelligence) + the four free news keys (recall) + **X API v2 pay-per-use**
(observed edges + real account data) + the OpenSanctions FARA export (enrichment). That set
runs all four stages of Social Analyze and produces a network map with real observed edges.
Everything else (Meta, TikTok) is additive per platform you can lawfully reach.

---

## Cost & tuning notes
- `claude-fable-5` is a Mythos-tier model — materially pricier/slower than Sonnet. The
  model-switch prompt wires an `ANTHROPIC_MODEL` env override so you can run Fable for heavy
  synthesis and drop back to a cheaper id per-environment without touching code.
- All external calls are cached + rate-limited per `(source, query, day)` for reproducibility;
  X pay-per-use dedupes same-post reads within 24h, so caching also directly saves money.
- Start keyless to validate the pipeline shape, then add Tier 1, then fund X. Don't buy TikTok/
  Meta depth until a real case needs that specific platform.
