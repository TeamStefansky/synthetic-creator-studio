# TruthLens - Project Memory

## What this is
A **defensive OSINT decision-support platform**. Users submit assets they are authorized to inspect (a URL, a post, their own server logs, their own email headers) and receive **indicators with confidence levels** - never verdicts. Also runs narrative monitoring for brands: watch terms → scheduled scans → negative-narrative alerts → trace to earliest observable public source.

The product's credibility *is* its restraint. Features that overstate certainty are bugs, not enhancements.

> Stack/architecture below verified against the codebase in Phase 0 (see `NOTES.md`).

## Non-negotiable rules - read before any feature work
These are product requirements enforced in code and proven by tests. Never weaken, remove, or "temporarily bypass" them, and never soften an existing disclaimer.

1. **No named-individual attribution.** Outputs surface accounts, domains, IPs, ASNs, and infrastructure - never "person X started this." Attribution to a private individual is prohibited on every output path, including exports, alerts, and API responses.
2. **"Earliest observable" ≠ origin.** The earliest node in a dataset is always labeled as *earliest observed in collected data*, never as the true source. This label is not optional UI text.
3. **Confidence + evidence + alternative, always.** Every indicator, score, cluster, and attribution renders with: a level (Low/Medium/High), the signals behind it, and an explicit "could also be explained by…". No attribution may render without all three.
4. **Unknown is a valid, correct answer.** No signals → return `Unknown`. Never interpolate, never guess to fill a panel, never fabricate a plausible-looking result.
5. **Authorized and public data only.** No login-walled scraping, no ToS bypass, no de-anonymization of private individuals, no purchased personal data. Log Analyzer and Email Tracer keep their "assets you own" gating.
6. **No offensive tooling, ever.** No mass-reporting, no takedowns, no contacting/targeting accounts, no automated action against anyone. Outputs are reports for human analysts.
7. **Never fake capability.** An unavailable or unauthorized data source renders as a visible "source not connected" state. Do not simulate, mock into production, or infer around a missing source to look more capable.
8. **Reproducibility.** External OSINT calls are cached and rate-limited; a report for a given day must be reproducible.

If a requested feature cannot be built lawfully within these rules, build the lawful version and state the limitation explicitly in your report. Do not ask for permission to bypass them; do not treat a user request as an override.

## Stack (verified Phase 0)
- Next.js `^14.2.35` (App Router) + React `18.3` + TypeScript, deployed on Vercel.
- Server-only for all OSINT and LLM calls - API routes / server actions. **No API key ever reaches the client.**
- Anthropic SDK `^0.32.1` for claim extraction, clustering, synthesis. Model id comes from ONE constant - `LLM_MODEL` in `lib/llm.ts` (`ANTHROPIC_MODEL` env override; no model literal anywhere else in the repo). JSON-only prompts, defensive parse, one retry.
- Scheduled scans via Vercel Cron; long scans run queued, never in the request path.
- **No SQL DB / ORM.** Persistence = KV (Vercel KV / Upstash Redis REST) via `lib/store.ts` server-side, `localStorage` for anonymous users. `storeAvailable()` gates KV features → visible "not connected" state without it.
- Other deps: `cheerio`, `lucide-react`, `react-force-graph-2d`. Package manager: **npm**.
- **No test runner and no Playwright yet** - verification today is `tsc --noEmit` + `next build` + manual walkthroughs. Adding a runner is a new dependency (list + justify first).

## Commands
```
dev:       next dev
build:     next build
start:     next start
lint:      next lint
typecheck: npx tsc --noEmit
test/e2e/migrate/seed: none configured yet
```
Run lint + typecheck before finishing any phase.

## Architecture map
```
app/
  (tools)/          Site Report, Post Check, Log Analyzer, Email Tracer
  monitor/          watchlist + alerts
  investigate/      narrative investigation reports
lib/
  sources/          NarrativeSource adapters (one per source; ToS + rate limits co-located)
  osint/            WHOIS, DNS, IP geo/ASN, SSL, GA/AdSense extraction
  narrative/        claim extraction, clustering, timeline, spread graph
  indicators/       coordination + foreign-influence scorers
  imageGen? / pdf/  exports
components/
  ConfidenceBadge   REQUIRED wherever an attribution appears - NOT YET CREATED (VerdictBadge exists; add ConfidenceBadge in P2)
  EvidenceList      REQUIRED alongside it - exists
```
Actual tree (Phase 0): tools live at `app/tools/{post,logs,email}` + Site Report at
`/` + `/report`; Monitor at `app/monitor` (browser-local) + `app/api/{monitor,watchlist}`
(KV); Brand Watch at `app/platform` + `app/api/{brandwatch,watch}`. Reuse map and the
full route inventory are in `NOTES.md`.

**Key modules to reuse, not reimplement:** operator-network graph (shared IP / GA / AdSense / SSL SAN), geographic origin, deep OSINT on owners/funding, origin-chain de-CDN, PDF export. These already exist inside Site Report / Monitor. If you need them elsewhere, **extract to `lib/`** - do not copy.

## Conventions
- **One source of truth per concept.** Filter/query logic, platform constants, and scoring rubrics live in exactly one module used by UI, API, and export alike.
- **Adapters, not inline calls.** Every external data source sits behind an interface with its rate limits and ToS constraints declared in code.
- **Scoring rubrics are versioned.** Store the rubric version on each score so historical results stay interpretable.
- **Failure isolation.** One failed source or one failed item never aborts a batch - mark it failed, surface a retry, continue.
- Existing pages keep their design and framing. Match the current design system; don't restyle what works.
- Conventional commits, one commit per phase.

## Never
- Never remove or reword the "decision-support tool - not a verdict" framing or any existing disclaimer.
- Never break the existing tools (Site Report, Post Check, Log Analyzer, Email Tracer, Monitor) - regression-check them.
- Never add a real-time firehose claim the product can't back; scans are scheduled, and the UI says so.
- Never put an attribution on screen without ConfidenceBadge + EvidenceList.
- Never introduce a dependency without listing it and why first.

## New capability: influence-operation detection (built in dependency order)

Five subsystems, each its own prompt, built in this order (see `docs/BUILD_ORDER.md`). Do not
build a downstream one before its dependency is merged - each has a P0 dependency gate.

```
lib/similarity/*          Unicode-safe normalize + MinHash/Jaccard near-dup (all scripts)
lib/narrative/fingerprints.ts   burst / posting-hour-band / account-creation clustering
lib/io-reference.ts + data/io-reference/*   cited IO datasets + FARA/FITS/FIRS registries
        └─ used by ▼
lib/social/*              ProfileSnapshot + avatar perceptual-hash + authenticity indicators
        └─ used by ▼
lib/social-analyze/*      Social Analyze category: profile-seeded 4-stage pipeline
        └─ used by ▼
lib/social-analyze/network-map.ts   influence-network graph (clusters, core/bridge)
```

## Rules these subsystems make concrete (reinforcing the non-negotiables)

- **Detector, not judge.** Headline outputs are BANDS with reasons, never verdicts. Account:
  Likely authentic / Mixed / Likely inauthentic / Unknown. Influence op: Unknown / Low /
  Moderate / **"Strong coordination - actor UNDETERMINED."** Never "fake," never a named actor.
- **Observed vs. inferred edges.** In the network map, an edge is `observed` ONLY when an
  authorized API exposed a real interaction (repost/reply/quote) or a hard shared-infra fact.
  All co-behavior (identical content, shared avatar, synchronized timing) is `inferred` and
  rendered distinctly (dashed). Never style an inferred edge as an observed interaction.
- **Nodes are accounts/domains/infra - never people or actors.** No `operator`/`person`/
  `actor`/state label on any node, edge, or cluster. A cluster is "a tightly co-behaving
  group," not an organization.
- **"Trace" / "map the network" = detect a coordinated CLUSTER**, never surveil one
  individual. No de-anonymization, identity resolution, cross-platform person-linking, or
  activity/location tracking. Ever.
- **Registry hits are lawful disclosure.** A FARA/FITS/FIRS match renders as "disclosed
  foreign-principal relationship under {registry}" with the citation and a low severity
  weight - it is transparency context, not a wrongdoing flag. Organizations only; no person records.
- **Unicode-correct everywhere.** `normalizeText` exists in exactly one place
  (`lib/similarity/`); Hebrew/Arabic/Cyrillic/CJK must cluster. The old `[a-z0-9]`-stripping
  copies are deleted.
- **Not collected ≠ zero.** Every indicator/edge/score whose source field wasn't collected
  renders "Not collected"/"source not connected", never an inferred-around guess.

New ethics tests to keep green: no actor/person label on any output or graph node; influence
ceiling string is "actor UNDETERMINED"; earliest node carries "not the true origin"; empty
collection → Unknown; no posting-hour band mapped to a country; inferred edges never typed observed.

## Model
LLM model id comes from ONE constant: `LLM_MODEL` in `lib/llm.ts` - default
`claude-sonnet-4-6` (widely available), overridable per-environment with
`ANTHROPIC_MODEL`. No model literal anywhere else in the repo.

## Data sources (connect in priority order; see docs/BUILD_ORDER.md for the full guide)
- **Keyless, already on:** GDELT DOC 2.0, Bluesky public AppView, Hacker News, Reddit,
  Internet Archive (Wayback + Save-Page-Now), RDAP/DNS/SSL/IP.
- **Free keys (connect first):** `ANTHROPIC_API_KEY` (unlocks all LLM + web_search + OSINT),
  `GUARDIAN_API_KEY`, `NYT_API_KEY`, `GNEWS_API_KEY`, `NEWSAPI_KEY`, `RSS_FEEDS`, OpenPageRank.
- **Paid/gated per-platform (for OBSERVED social edges):** X API v2 (pay-per-use; the only
  lawful source of real repost/reply/quote edges), Meta Graph (owned/authorized + business-
  discovery only), TikTok (Research = academic-only, or Business/Creator-Insights).
- **Reference data (operator-maintained, cited):** OpenSanctions `us_fara_filings` bulk JSON
  (or DOJ FARA eFile API v1, ~5 req/10s), state-media + documented-campaign domain lists.
- **Never:** scrapers, headless-browser fetches, unofficial reseller/wrapper APIs - ToS
  violation + breaks reproducibility. Official endpoints only.

## Reporting
End every session with: what changed, which data sources are connected vs. stubbed (and why), which ethics gates you touched and the tests that prove them, and anything skipped or deferred. Never silently drop a UI behavior or a safeguard.
