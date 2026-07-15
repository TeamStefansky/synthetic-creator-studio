# Task: Restructure TruthLens around Check + Watch, and build narrative detection + brand monitoring

> A `CLAUDE.md` in this repo defines the project's non-negotiable ethical rules. Read it first. Everything below operates inside those rules; nothing here overrides them.

## Context
Live app: `https://synthetic-creator-studio.vercel.app/` — **TruthLens**, a working defensive OSINT decision-support tool. Existing capabilities, all working, all to be preserved:
- **Site Report** — paste a URL → credibility-risk indicators, operator-network graph (shared IP / GA / AdSense / SSL SAN), geographic origin, deep OSINT on owners/funding, origin-chain de-CDN attempt.
- **Post Check** — verify a claim against sources.
- **Log Analyzer** — flag bots / datacenter ASNs in logs the user owns.
- **Email Tracer** — header-based origin + spoofing verdict.
- **Monitor** — browser-local watchlist recording a risk point per check.

The live app is the **design and tone source of truth**. Its framing — *"decision-support tool — not a verdict"*, indicators over conclusions, probabilistic attribution, "Unknown" is a valid result, analyze only assets you're authorized to inspect — is a product requirement, not decoration.

ASSUMPTION: Next.js (App Router) on Vercel. Extend this codebase and its design system. Do not rebuild, do not restyle working pages.
ASSUMPTION: OSINT primitives (WHOIS, DNS, IP geo/ASN, SSL, GA/AdSense extraction) are partly wired already. Missing sources get an adapter, never an inline call.
ASSUMPTION: Anthropic SDK available server-side for claim extraction, clustering, and synthesis.

## The structural problem this task fixes
Today the app is a **toolbox**: five parallel tools, each its own destination, each ending in a result that evaporates. Two consequences:
- Findings never meet. Email Tracer and Site Report can surface the same IP and the product cannot see it — even though the operator-graph logic that would spot it already exists, trapped inside a single report's scope.
- Alerts have nowhere to land. A Monitor notification leads to a dead end instead of an investigation.

The fix is **not** a heavyweight "case management" model — that's an analyst tool, and our users are a curious reader checking a suspicious site or a brand manager watching for trouble. Neither wants to *manage* anything. So we collapse to **two user-facing jobs**, and everything clever happens underneath without the user administering it.

## Objective
Restructure the product around exactly two things a user does:
1. **Check** — "check this for me." Paste a URL, a post, an email header, a log, or a claim/narrative → get a report with confidence-scored indicators. Every check is saved to history automatically; the user never files anything.
2. **Watch** — "keep an eye out for me." Define what to monitor → get alerts. An alert opens a Check on its source.

The existing tools stop being destinations and become **check types inside Check**. Beneath both, a **clue layer** silently links repeated entities (IPs, domains, accounts, ASNs) across checks and surfaces the connection as a line in the report — never as a graph the user must operate.

On top of this, deliver the two requested capabilities:
- **(A) Disinformation / foreign-influence detection**: a Check on a claim or seed URL collects public items repeating the narrative, clusters them, maps propagation over time, ranks coordination and foreign-influence indicators with confidence, and identifies the **earliest observable public accounts/domains in the collected data** — as leads with evidence, never accusations.
- **(B) Brand narrative monitoring**: a brand Watch scans configured public sources on a schedule, detects emerging negative narrative clusters, alerts on abnormal growth, and offers one-tap "trace this to its earliest observable source" using the same engine as (A).

## Requirements

### Structure
1. **Check** (`/check`): one entry point accepting a URL, post link, claim text, pasted email headers, or an uploaded log. Auto-detect input type and route to the right check; let the user override the detected type. The existing tools' logic is reused as check types — **do not reimplement them**. Their current standalone routes keep working (redirect or keep as deep links); nothing existing breaks.
2. **History**: every check is persisted automatically with its inputs, results, and timestamp, and is re-openable. No "save" button, no naming, no folders. Anonymous users keep working via the existing browser-local path; signed-in users get server-side history.
3. **Clue layer**: entities extracted from every check (domain, IP, ASN, account handle, email domain, GA/AdSense ID, SSL SAN) are stored and linked. When an entity in the current report also appeared in the user's earlier checks or in the same narrative cluster, the report shows a plain line — e.g. *"This IP also appeared in 2 sites you checked before"* — linking to those checks. **No graph UI to manage, no entity browser, no user-facing vocabulary for this.** Reuse the operator-graph linking logic by extracting it from Site Report into `lib/clues/`; do not copy it.
4. **Watch** (`/watch`): evolve the existing Monitor. A watch has: terms (brand name, aliases, products), excluded terms (competitors), sources to scan, sentiment threshold, cadence. Server-side per user; the current browser-local watchlist keeps working for anonymous users.
5. **Navigation**: Check → Watch → History. Tools are not top-level navigation any more; they're check types. Keep the existing framing line on every screen.

### Shared narrative engine (powers both A and B)
6. **Ingestion adapters** behind one interface `NarrativeSource` in `lib/sources/`: start with lawful, API-available sources (RSS/news APIs, public web search, the app's own site-report data, user-supplied exports). Each adapter declares its rate limits and ToS constraints in code. An unavailable or unauthorized source renders as a visible **"source not connected"** state — never simulated, never inferred around.
7. **Claim extraction** (LLM, JSON-only, defensive parse + one retry): from a seed URL/post/claim, derive the core claim(s) plus 3–6 paraphrase/keyword variants to widen recall.
8. **Clustering**: group collected mentions into narrative clusters by semantic similarity. Each cluster: label, size, source breakdown, first-seen / last-seen.
9. **Propagation timeline + spread**: order mentions chronologically; infer echo relationships only from public quotes/links/reposts. Mark the **earliest observable nodes**, always labeled *earliest observed in collected data — not the true origin*. This label is not optional UI text.
10. **Coordination indicators**, each with {level, signals, alternativeExplanation}: burst synchronicity, shared infrastructure across involved sites (reuse the clue layer), near-duplicate phrasing, cross-language mirroring, public account-creation clustering. Render as an indicator checklist — never a boolean "coordinated: yes."
11. **Foreign-influence indicators**, same shape: registrant / DNS / mail / server geography (reuse existing geo origin), hosting ASN patterns, posting-timezone vs. claimed-locale mismatch, overlap with reputable public datasets (cited, linked). Each must state plainly that these indicate correlation, not proof of state involvement.

### (A) Narrative check
12. Adding a claim or seed URL to Check runs the engine and returns a report with: narrative summary, clusters, propagation timeline, earliest-observable nodes, coordination and foreign-influence panels, clue-layer connections, and a **source appendix** listing every collected item with URL and timestamp. The headline output is a **risk band with reasons** — never a verdict.
13. A Site Report offers "Check narratives from this site", pre-seeding a narrative check.

### (B) Watch → alert → trace
14. **Scheduled scans** via Vercel Cron run each active watch through the adapters, score sentiment per mention (deterministic rubric or LLM with a fixed rubric; store the rubric version on every score), and maintain rolling volume + net-sentiment trends.
15. **Alerting**: cluster negative mentions; raise an alert when a cluster's growth is abnormal versus its rolling baseline or crosses the configured threshold. Alert payload: cluster label, sample mentions, growth curve, confidence, severity. Channels: in-app feed, webhook POST, optional email. Alerts inform — the platform never acts against anyone.
16. **Trace**: "Trace this narrative" runs the same engine scoped to the cluster and returns earliest-observable public accounts/domains with the same guarantees as (A).

### Cross-cutting
17. **`<ConfidenceBadge>` + `<EvidenceList>`**: every indicator, score, cluster, and attribution renders with a level (Low/Med/High), its signals, and an explicit "could also be explained by…". No attribution may render without both. No signals → `Unknown`.
18. **PDF export** of any report and alert dossier — reuse the existing Monitor PDF export.
19. **Caching + rate limiting** on all external calls, keyed by (source, query, day), so reports stay reproducible and within ToS.

## Technical decisions (follow these — do not re-litigate)
- Extend the existing Next.js/Vercel app, design system, and framing components.
- All OSINT and LLM calls server-side only (route handlers / server actions). No key ever reaches the client.
- DB (Vercel Postgres or the app's existing store): `Check`, `Entity`, `EntityLink`, `Narrative`, `Mention`, `Cluster`, `Watch`, `Alert`. Keep the anonymous browser-local paths working.
- Extract, don't copy: operator-graph → `lib/clues/`, geo origin + OSINT primitives → `lib/osint/`. Site Report then consumes them like everyone else.
- Ingestion strictly behind `NarrativeSource`. Long scans run queued, never in the request path.
- Scoring rubrics are versioned and stored per score.
- Failure isolation everywhere: one failed source or item marks itself failed and offers retry — it never aborts a batch.
- New dependencies: list and justify before installing.

## Constraints & non-goals
- No named-individual attribution, no de-anonymization, no login-walled scraping, no ToS bypass — on any output path, including exports, alerts, and webhooks.
- No takedown, mass-report, or contact tooling. Ever.
- No real-time firehose in v1 (no paid platform firehose). Scans are scheduled and the UI says so plainly.
- No "case management": no filing, naming, foldering, or entity-graph administration surfaced to users. If a feature requires the user to *manage* something, it's wrong — rethink it.
- Do not break Site Report, Post Check, Log Analyzer, Email Tracer, or the current Monitor. Do not remove or soften any existing disclaimer.

## Implementation plan
Run phases in order. Each ends in a working, verified state. **Do not start a phase before the previous one's verification passes.**

0. **Discovery**: read the codebase and the live routes. Produce `NOTES.md`: current route map, where operator-graph / geo-origin / OSINT / PDF export live, Monitor's persistence, design tokens, and the exact framing strings to reuse. Also fill in every `TO VERIFY` in `CLAUDE.md` from the real codebase. **Stop and show `NOTES.md` before coding.**
1. **Check shell + history**: `/check` with input auto-detection, existing tools rewired as check types, automatic persistence, re-openable history. Verify: every existing tool still produces identical output through the new entry point; old routes still work; a check survives a refresh and reopens from history; regression pass on all five tools.
2. **Clue layer**: extract operator-graph into `lib/clues/`, entity extraction + linking on every check, the plain "also appeared in…" line in reports. Verify: unit tests on extraction/linking; manually run two checks sharing an IP → the second report shows the connection line and links back to the first.
3. **Sources + narrative engine**: adapters (≥2 lawful sources) with caching/rate limits, claim extraction, clustering, timeline, earliest-observable labeling. Verify: fixture tests produce stable clusters and the correct chronological earliest node; an unconnected source renders its "not connected" state.
4. **Indicators**: coordination + foreign-influence scorers reusing the clue layer and geo origin. Verify: unit tests assert every indicator emits level + signals + alternative, and that zero signals yields `Unknown`.
5. **Narrative check UI**: the full report inside Check, source appendix, risk band, Site Report deep-link, PDF export. Verify: a component test proves no attribution renders without ConfidenceBadge + EvidenceList; PDF exports correctly.
6. **Watch + alerts + trace**: watch CRUD, Vercel Cron scans, sentiment + rolling baseline, spike detection, in-app feed + webhook + email, "Trace" action. Verify: a simulated spike in tests raises exactly one alert with correct severity and a working trace; the webhook receives the documented payload; anonymous Monitor still works unchanged.
7. **E2E (Playwright)**: (A) check a claim → report renders clusters, timeline, earliest-observable nodes, indicators, all confidence-badged → PDF exports. (B) create a watch → inject a mocked negative spike → alert fires → trace returns earliest-observable nodes. Verify: green.

## Verification (definition of done)
- `npm run build`, `npm test`, `npx playwright test` all pass. All five original tools regression-pass.
- Ethics gates proven by tests: (a) no output path emits a named private individual as originator; (b) every attribution carries confidence + evidence + alternative; (c) zero signals → `Unknown`; (d) Log Analyzer and Email Tracer keep their authorization gating; (e) an unconnected source shows "not connected" rather than fabricated data.
- Simplicity gate — walk the UI and confirm: a user can complete both jobs without creating, naming, or filing anything. No "case", no entity-graph management, no folders. If any flow requires the user to administer an object, it fails this gate.
- Manual (A): check a claim → clusters, timeline, correctly-labeled earliest-observable nodes, coordination + foreign-influence panels with confidence, clue-layer connections, full source appendix, risk band (not a verdict).
- Manual (B): create a watch → run the cron scan manually → a negative cluster crosses threshold → alert in feed + webhook fires → trace returns confidence-scored earliest nodes.
- All external calls cached and rate-limited; same-day reports reproducible.

## Working style
One commit per phase, conventional commits. Lint + typecheck before finishing each phase. After each phase, stop and report before continuing.

Final report must include: what changed, which sources are connected vs. stubbed and why, each ethics gate with the test that proves it, the simplicity-gate walkthrough result, and anything skipped or deferred. If a requested capability can't be delivered lawfully with available sources, build the lawful version and state the limitation plainly — never fake data or simulate a source to appear more capable.
