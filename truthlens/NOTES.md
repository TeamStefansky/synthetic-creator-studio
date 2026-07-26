# Phase 0 — Discovery notes (Check + Watch restructure)

Read of the actual codebase before touching anything. **Stop-for-approval gate.**

## Route map (today)

### Pages (`app/`)
| Route | What it is |
|---|---|
| `/` | Home — `UrlInput` → Site Report |
| `/report` | Site Report result (infra graph, geo, OSINT, origin-chain, rating) |
| `/tools/post` | Post Check (fact-check a claim/post) |
| `/tools/logs` | Log Analyzer (bots/datacenter ASNs in logs you own) |
| `/tools/email` | Email Tracer (header origin + spoofing) |
| `/monitor` | Monitor — **browser-local** watchlist (risk point per check) |
| `/platform` | **Brand Watch** (new, in-app narrative monitoring) |
| `/checks` | "Recent shared checks" gallery (from `/api/share?list=1`) |
| `/about`, `/embed/post` | About page; embeddable post widget |

### API (`app/api/`)
`analyze` (Site Report engine) · `post-check` · `logs` · `email-trace` · `osint` ·
`insights` · `intel` (social + image) · `share` (+`?list=1`) · `monitor` (cron) ·
`watchlist` (dashboard feed) · `brandwatch` (+`/report`) · `watch` (+`/scan`) ·
`platform/[...path]` — **orphaned Render proxy, now unused** (candidate for removal).

## Key modules to REUSE (extract to `lib/`, do not reimplement)
| Concept | Lives in | Note |
|---|---|---|
| Operator-network graph (shared IP / GA / AdSense / SSL SAN / reverse-IP) | `lib/network.ts` | **Extract to `lib/clues/` for the clue layer** |
| Geographic origin | `lib/geo.ts` (+ `geo-centroids`, `countries`) | |
| OSINT primitives | `lib/{dns,rdap,ip,ssl,reverseip,fingerprint,archive,factcheck,reputation,authority,page-fetch}.ts` | |
| Deep OSINT dossier (Anthropic web_search) | `lib/osint.ts` | gated by `ANTHROPIC_API_KEY` |
| Origin-chain de-CDN | `lib/origin-trace.ts` | |
| Earliest-observable propagation (open web) | `lib/propagation.ts` | already labels earliest publisher |
| Coordination indicator (Low/Med/High + evidence) | `lib/coordination.ts` | |
| Insights Q&A / Post-check / Social+image | `lib/{insights,post-check,social,image-detect}.ts` | |
| Report + export | `lib/report-export.ts` | Markdown + auditable rating; **no PDF lib** |
| Scoring / adversary flags | `lib/{scoring,adversary}.ts` | |
| Narrative engine (new, in-app) | `lib/narrative/{types,sentiment,sources,threat,clusters,watch}.ts` | Brand Watch |

## Persistence (there is NO SQL DB)
- **KV store** = single source of truth server-side: `lib/store.ts` over Upstash/Vercel-KV
  REST. `storeAvailable()` gates it; without it, features show a visible
  "not connected" state.
- **Anonymous** = browser `localStorage` (`tl:watchlist`, `tl:hist:{domain}`).
- Existing KV keys: `monitor:snap:{domain}`, `monitor:hist:{domain}`.
- Brand Watch KV keys: `bw:watch:list`, `bw:snap:{entity}`, `bw:alerts`,
  `bw:live:{entity}`, `bw:narr:{entity}:{day}`.
- → **Check history + clue layer will use KV server-side + localStorage for anon.**
  No new database is needed (and none should be added without justification).

## Design system & framing (reuse, don't restyle)
- Tokens (`tailwind.config.ts`): `risk.{legit,unknown,high}`, `bg.{base,card,elev}`,
  `brand.{DEFAULT,soft}`; shadows `soft`/`glow`; utilities `.card`, `.card-elev`,
  `.ring-hairline` (globals.css).
- Framing components: `components/Disclaimer.tsx` (footer + inline, exact strings),
  `components/EvidenceList.tsx` (**exists**). **`ConfidenceBadge` does NOT exist yet**
  (there is `VerdictBadge`) → must be created; CLAUDE.md requires it wherever an
  attribution renders.
- Exact framing strings to keep verbatim: *"Decision-support tool — not a verdict."*
  · *"Indicators only."* · *"Unknown is a valid, common result."* · *"Analyze only
  logs and emails you are authorized to inspect."*

## Stack facts (filled into CLAUDE.md TO VERIFY)
- Next.js `^14.2.35` (App Router), React `18.3`, TypeScript, Tailwind. Vercel.
- Anthropic SDK `^0.32.1`; model id in use: `claude-sonnet-4-6`. Also `cheerio`,
  `lucide-react`, `react-force-graph-2d`.
- **No test runner** (only `next lint` + `next build` + `tsc --noEmit`). **No Playwright.**
- Package manager: **npm**. Commands: `dev/build/start/lint`; typecheck via `npx tsc --noEmit`.

## Gaps the restructure must close (and the honest cost)
1. **No unified `/check`** — the five tools are separate destinations today.
2. **No check history** — nothing is persisted per check yet. → KV (server) +
   localStorage (anon). Entity extraction must run on every check.
3. **No clue layer** — operator-graph linking is trapped in Site Report
   (`lib/network.ts`). → extract to `lib/clues/`, store entities, link across checks.
4. **No `ConfidenceBadge`** component → create it; adopt it everywhere an attribution shows.
5. **"PDF"** today = Markdown + a print-to-PDF HTML route (Brand Watch). A true PDF
   lib would be a **new dependency** — will list + justify before adding, or keep print-HTML.
6. **No test runner / Playwright** — the spec's `npm test` / `npx playwright test`
   gates need **new dev dependencies**. Will propose adding a light runner (e.g.
   `vitest`) + Playwright, listed and justified, before Phase 1 verification — or,
   if you prefer zero new deps, verify via `tsc`/`build` + manual walkthroughs.

## Proposed phase order (matches CHECK_WATCH_RESTRUCTURE.md; stop-gate each)
- **P1 Check shell + history** — `/check` auto-detect + route to existing tools as
  check types; persist each check (KV + localStorage); re-openable history.
  Regression-check all five tools.
- **P2 Clue layer** — extract `lib/network.ts` → `lib/clues/`; entity extraction +
  linking; the plain "also appeared in N checks" line. Add `ConfidenceBadge`.
- **P3 Narrative engine polish** — the new `lib/narrative/*` already covers ingestion
  + clustering + earliest-observable; wire a claim/seed **Check** on top of it.
- **P4 Indicators** — coordination + foreign-influence scorers reusing clues + geo,
  each emitting level + signals + alternative; zero signals → Unknown.
- **P5 Narrative check UI** — full report inside Check + source appendix + Site
  Report deep-link + export.
- **P6 Watch + alerts + trace** — Brand Watch (already built) folded in as Watch;
  "Trace to earliest observable" via propagation engine.
- **P7 E2E** — (pending the test-runner decision above).

## Two decisions I need before P1
1. **Test tooling:** add `vitest` + Playwright (new dev deps, enables the spec's
   verification gates) — or verify with `tsc`/`build` + manual walkthroughs (no new deps)?
2. **History for anonymous vs signed-in:** there is no auth system today. OK to do
   **anonymous = localStorage, shared/team = KV** (no login), and defer real accounts?

## Connections — user-managed RSS/Atom feeds (SHIPPED, P1–P3)

New capability: paste RSS/Atom feed URLs under **Connections → Feed Sources**
(`/connections`); each validates on add (with a live preview) and then feeds the
narrative / Brand Watch analysis as the `rss` source. Commits: `d6e8c15` (P1),
`927ac61` (P2), `b94b214` (P3).

- **Code:** `lib/feeds/fetch.ts` (SSRF-guarded `safeFetchText` + RSS/Atom `parseFeed`
  + `sanitizeText`), `lib/feeds/store.ts` (`UserFeed`, caps, `validateAndPreview`,
  KV CRUD, per-feed status), `app/api/connections/feeds/route.ts`,
  `app/connections/page.tsx`, extended `rss` adapter in `lib/narrative/sources.ts`.
  Placed under `lib/feeds/` (NOT `lib/connections/`, which is the existing
  connection-STATUS module `lib/connections.ts` — spec's path would have collided).
- **Storage & scope:** the deployment is **single-tenant** (one shared `SITE_PASSWORD`
  = one workspace), so feeds live in ONE workspace KV namespace `conn:feeds:default`
  when `storeAvailable()`, else the client keeps them in `localStorage`
  (`tl:connections:feeds`) with an honest "store not connected" note. This is a
  conscious refinement of the spec's "no identity → localStorage only": KV is needed
  for the objective (server-side scans + cron must read the feeds), and with one
  shared login there is exactly one tenant, so `:default` is that tenant's workspace,
  not a cross-tenant/global namespace. **Per-user scoping is deferred** until there is
  per-user identity (then key on `conn:feeds:{userId}`).
- **SSRF rules** (every server-side fetch, validation + scan): http(s) only; reject
  literal + DNS-resolved private/loopback/link-local/metadata ranges (10/8, 127/8,
  0/8, 169.254/16 incl. 169.254.169.254, 172.16/12, 192.168/16, 100.64/10, CGNAT,
  multicast, ::1, fe80::, fc00::/7, IPv4-mapped) and internal hostnames
  (`localhost`, `.internal`, `.local`, `metadata.google.internal`); cap redirects
  (3, re-checked each hop), size (2 MB), time (12 s); declared UA.
- **Per-feed status:** the `rss` adapter records ok/error/empty (+ etag/last-modified)
  per feed back to the store (`recordFeedStatuses`), driving the UI badges; one feed
  erroring never aborts the others (failure isolation). Caching per `(feedUrl, day)`
  via `lib/cache.ts`; conditional-GET (ETag/If-Modified-Since) honored.
- **Tests:** `tests/feeds.test.ts` (SSRF blocks, sanitize, RSS+Atom parse, non-feed
  rejected, dedup). Verified: tsc + `vitest` (481) + `next build`. `next lint` is not
  configured in this repo (interactive setup); `playwright` e2e not run in-sandbox.
- **Deferred future Connections types:** authenticated feeds, JSON-feed / sitemap,
  per-feed language/region tagging, OPML import/export, and per-user feed scoping.
