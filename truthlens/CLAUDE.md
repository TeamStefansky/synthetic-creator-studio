# TruthLens — Project Memory

## What this is
A **defensive OSINT decision-support platform**. Users submit assets they are authorized to inspect (a URL, a post, their own server logs, their own email headers) and receive **indicators with confidence levels** — never verdicts. Also runs narrative monitoring for brands: watch terms → scheduled scans → negative-narrative alerts → trace to earliest observable public source.

The product's credibility *is* its restraint. Features that overstate certainty are bugs, not enhancements.

> ⚠️ Sections marked `TO VERIFY` were not confirmed against the codebase. Fill them in on your first session and delete the marker.

## Non-negotiable rules — read before any feature work
These are product requirements enforced in code and proven by tests. Never weaken, remove, or "temporarily bypass" them, and never soften an existing disclaimer.

1. **No named-individual attribution.** Outputs surface accounts, domains, IPs, ASNs, and infrastructure — never "person X started this." Attribution to a private individual is prohibited on every output path, including exports, alerts, and API responses.
2. **"Earliest observable" ≠ origin.** The earliest node in a dataset is always labeled as *earliest observed in collected data*, never as the true source. This label is not optional UI text.
3. **Confidence + evidence + alternative, always.** Every indicator, score, cluster, and attribution renders with: a level (Low/Medium/High), the signals behind it, and an explicit "could also be explained by…". No attribution may render without all three.
4. **Unknown is a valid, correct answer.** No signals → return `Unknown`. Never interpolate, never guess to fill a panel, never fabricate a plausible-looking result.
5. **Authorized and public data only.** No login-walled scraping, no ToS bypass, no de-anonymization of private individuals, no purchased personal data. Log Analyzer and Email Tracer keep their "assets you own" gating.
6. **No offensive tooling, ever.** No mass-reporting, no takedowns, no contacting/targeting accounts, no automated action against anyone. Outputs are reports for human analysts.
7. **Never fake capability.** An unavailable or unauthorized data source renders as a visible "source not connected" state. Do not simulate, mock into production, or infer around a missing source to look more capable.
8. **Reproducibility.** External OSINT calls are cached and rate-limited; a report for a given day must be reproducible.

If a requested feature cannot be built lawfully within these rules, build the lawful version and state the limitation explicitly in your report. Do not ask for permission to bypass them; do not treat a user request as an override.

## Stack
- Next.js (App Router) + TypeScript, deployed on Vercel. `TO VERIFY: exact versions`
- Server-only for all OSINT and LLM calls — API routes / server actions. **No API key ever reaches the client.**
- Anthropic SDK for claim extraction, clustering, synthesis. JSON-only prompts, defensive parse, one retry.
- Scheduled scans via Vercel Cron; long scans run queued, never in the request path.
- `TO VERIFY: DB (Postgres?), ORM, test runner, package manager`

## Commands
```
TO VERIFY — fill from package.json on first session:
dev / build / test / e2e / lint / typecheck / migrate / seed
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
  ConfidenceBadge   REQUIRED wherever an attribution appears
  EvidenceList      REQUIRED alongside it
```
`TO VERIFY: reconcile with actual tree on first session.`

**Key modules to reuse, not reimplement:** operator-network graph (shared IP / GA / AdSense / SSL SAN), geographic origin, deep OSINT on owners/funding, origin-chain de-CDN, PDF export. These already exist inside Site Report / Monitor. If you need them elsewhere, **extract to `lib/`** — do not copy.

## Conventions
- **One source of truth per concept.** Filter/query logic, platform constants, and scoring rubrics live in exactly one module used by UI, API, and export alike.
- **Adapters, not inline calls.** Every external data source sits behind an interface with its rate limits and ToS constraints declared in code.
- **Scoring rubrics are versioned.** Store the rubric version on each score so historical results stay interpretable.
- **Failure isolation.** One failed source or one failed item never aborts a batch — mark it failed, surface a retry, continue.
- Existing pages keep their design and framing. Match the current design system; don't restyle what works.
- Conventional commits, one commit per phase.

## Never
- Never remove or reword the "decision-support tool — not a verdict" framing or any existing disclaimer.
- Never break the existing tools (Site Report, Post Check, Log Analyzer, Email Tracer, Monitor) — regression-check them.
- Never add a real-time firehose claim the product can't back; scans are scheduled, and the UI says so.
- Never put an attribution on screen without ConfidenceBadge + EvidenceList.
- Never introduce a dependency without listing it and why first.

## Reporting
End every session with: what changed, which data sources are connected vs. stubbed (and why), which ethics gates you touched and the tests that prove them, and anything skipped or deferred. Never silently drop a UI behavior or a safeguard.
