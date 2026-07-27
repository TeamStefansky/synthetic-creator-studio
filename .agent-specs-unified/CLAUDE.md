# CLAUDE.md

## Project

`newsradar` — organizational market-intelligence news product. An analyst inside an organization
defines the topics that matter to their org, receives a daily edition of the hottest headlines
matching those topics, monitors the numbers behind them, and exports a branded PDF briefing to
distribute to colleagues.

Four surfaces: **feed** (`/`), **topic configuration** (`/topics`), **dashboard** (`/dashboard`),
**reports** (`/reports`). Primary UI language is Hebrew, RTL. Content is multilingual.

**Product stance that governs every trade-off:** recall beats precision. A consumer feed fails by
being boring; this product fails by missing an event. Nothing is ever silently dropped — content
is collapsed, counted, and re-openable, never filtered away without a visible count.

## Stack

- Node 22 LTS, TypeScript 5.6 (strict), pnpm 9 workspaces
- `apps/web` — Next.js 15 App Router, React 19, plain CSS Modules over `tokens.css`
- `apps/api` — Fastify 5, Zod 3 on every boundary
- `workers/` — BullMQ 5 (ingest, match, rollup, report-render, report-send)
- `packages/core` — domain types, matching, scoring, metrics. Pure. No I/O.
- PostgreSQL 16 + pgvector 0.7, Prisma 6 (vector columns via raw SQL helpers)
- Redis 7 — job queues, live counters, preview cache
- Embeddings: `@xenova/transformers` / `Xenova/multilingual-e5-small` (384-dim, multilingual —
  the corpus is Hebrew, English, Arabic, German, French)
- PDF: Playwright Chromium rendering `/reports/:id/print`. **Never `window.print()`.**
- Email: Nodemailer over SMTP, config from env, sending is always queued
- Vitest 2, Playwright 1.4x

## Commands

```
pnpm dev            # web :3000, api :3001
pnpm test           # vitest
pnpm test:e2e       # playwright
pnpm lint           # eslint + prettier + token lint
pnpm lint:tokens    # fails on raw hex / raw px / font stacks outside tokens.css
pnpm typecheck
pnpm db:migrate
pnpm db:seed
pnpm ingest:once
pnpm report:render <id>   # render a report to PDF locally
```

## Architecture map

```
apps/web/app/(feed)/           feed, edition switcher, story card, dateline
apps/web/app/topics/           topic editor + live preview  ← the screen the product lives on
apps/web/app/dashboard/        heat board, geo, trends, negativity
apps/web/app/reports/          report builder
apps/web/app/reports/[id]/print/  print-only route, rendered by Playwright
apps/web/src/styles/tokens.css THE DESIGN CONTRACT. Read it before writing any component.
apps/api/src/routes/           feed, topics, preview, metrics, reports
packages/core/matching/        topic query → document match + score. Pure.
packages/core/metrics/         volume, velocity, acceleration, heat, lift. Pure.
packages/core/bidi/            mixed-direction string composition. One module, used everywhere.
workers/                       one directory per queue
```

## Design contract — non-negotiable

The visual system is already designed. Three artifacts, in order of authority:

1. `apps/web/src/styles/tokens.css` — **the machine-readable contract.** Values here win.
2. `docs/design-system.md` — the full visual specification: concept, type scale, colour roles,
   grid, component variants and states, and a layout spec per screen. Read the relevant screen
   section before building any surface.
3. `docs/design-reference/*.png` — rendered screenshots of the approved design, for human review.
   Not authoritative on values; authoritative on feel.

- No raw hex, no raw px spacing, no font stack outside `tokens.css`. `pnpm lint:tokens` fails
  the build on violation. Do not disable this rule.
- **No shadow on any in-page card.** Cards are separated by hairlines and space. Shadows exist
  only on dropdowns and modals. This is the single decision that defines the product's look.
- `radius` never exceeds 8px. Chips and inputs 2px, buttons and cards 4px, modals 8px.
- **Every story and every event carries a dateline strip**: IBM Plex Mono, 11px, uppercase,
  letter-spacing 0.12em, `--ink-300`, sitting under a 1px `--ink-900` rule, separated by ` · `.
- **Every card carries a full SourceStrip** — favicon, source name, country flag, relative time,
  external-link arrow. Never abbreviated. This is a product requirement, not decoration.
- Colour is never the sole carrier of meaning. Every heat badge shows its number; every stance
  chip shows its text (`שלילי`). This survives black-and-white printing of the PDF.
- Contrast: body ≥ 4.5:1, UI ≥ 3:1. Focus ring is identical on every field and button.
- Empty, loading and error states are designed states, never browser defaults.

## Roles and authorization

Two scopes. Effective permission is the union of the org-role grant and the workspace-role grant
for the resource's workspace.

```
OrgMember.orgRole:        OWNER · ADMIN · MEMBER
WorkspaceMember.role:     MANAGER · ANALYST · VIEWER
```

- **Never compare role names inside a route handler or a component.** All decisions go through
  `can(actor, capability, resource)` in `packages/core/authz/`, driven by `CAPABILITY_MATRIX`,
  which is a data structure, not a chain of conditionals.
- `can()` returns `{ allowed, reason }`. The typed reason is rendered in the UI — a denial without
  a reason produces support tickets.
- Every non-GET route carries the `requireCapability` decorator. A route-coverage test enforces
  this; do not disable it.
- Client-side capability checks are presentation only. The server check is the real one, and both
  must exist.
- `report.send.external` and `report.send.classified` consult org policy, not only role. An
  ANALYST adding an external recipient gets `POLICY_REQUIRES_APPROVAL` — a routing outcome, not a
  failure.
- Deactivating a member requires a successor, revokes sessions immediately, and transfers owned
  schedules and draft reports. It never deletes topics — topics belong to the workspace.

## Hard rules

- `packages/core` is pure: no Prisma, no fetch, no Redis. This is what makes matching, metrics and
  authorization testable without a database.
- **Topics belong to a Workspace, not a user.** Personal refinements live in a separate layer and
  never mutate the org-level topic definition.
- **Source rights gate report content.** A source marked `HEADLINE_LINK` contributes headline,
  source and link only — the renderer enforces this, it does not merely display the badge. Where
  content is trimmed, the PDF says so rather than truncating silently.
- **`unique(scheduleId, scheduledFor)` on `ScheduleRun` is the send-once guarantee.** A retrying
  worker must fail that write rather than mail the distribution list twice.
- Schedules store local time plus an IANA timezone and compute next runs DST-aware. Never store
  or compute a schedule in UTC.
- The scheduled pipeline is render → verify → send. A render failure notifies the owner and
  managers and sends nothing. Recipients never receive operational alerts.
- No path exists where an unapproved classified or external report sends because nobody responded.
  An expired approval window applies `SKIP` or `SEND_INTERNAL_ONLY`, never a full send.
- Per-member reading analytics are **off by default**, require an org-level toggle, display a
  notice to members while active, and log their own activation. Aggregate metrics are the default
  everywhere.

## Sentiment

- **Two numbers, never one**: `sentimentScore` (−1..+1, the polarity and its intensity) and
  `sentimentConfidence` (0..1). The displayed percentage is `round(|score| × 100)`. Confidence is
  shown separately and is never folded into the percentage.
- **Sentiment is per target, not per document.** The figure on a feed card is the sentiment toward
  the topic whose section the card sits in. A document can be positive toward one topic and
  negative toward another, and collapsing that to a document average erases the reason the product
  exists.
- The label is **derived** from `sentimentScore` via `SENTIMENT_THRESHOLDS`
  (`≤ −0.20 → NEGATIVE · < +0.20 → NEUTRAL · else → POSITIVE`). Never compute the two
  independently — two parallel judgments that can disagree destroy trust in both. The design's
  original five-step chip collapses to these three on every screen, including negative coverage.
- **Exactly three labels ship**: `POSITIVE`, `NEUTRAL`, `NEGATIVE`. Positive and negative render
  label + percentage; **neutral renders the label with no percentage** — "how strongly neutral"
  is not a quantity.
- Below `SENTIMENT_CONFIDENCE_FLOOR`, render **no chip at all** — not a fourth label. Absence reads
  as "not rated" and keeps `NEUTRAL` meaning exactly one thing. `getSentiment()` returns `null`.
- **Neutral counts in every average; unrated does not.** A neutral document is a measurement whose
  value is zero; an unrated one is the absence of a measurement. Conflating them biases every mean
  toward the middle and produces the classic "sentiment is always about neutral" bug.
- `classifiedShare` is the health gauge for the feature — a collapse in one language means the
  classifier broke there and no average will show it.
- Reported speech and opinion pieces are excluded from averages by default, and the UI states that
  they are.
- Only languages that clear the release floor in `pnpm eval:sentiment` are enabled. A disabled
  language renders no chip, never a guess.
- Every surface reads sentiment through `getSentiment()`, which returns a manual override in
  preference to the model and always reports which one it returned. Nothing reads the raw columns.
- Sentiment renders on the existing `--stance-*` ramp. Do not introduce a new colour scale, and
  never let colour be the sole carrier — always a label, so the printed PDF stays legible in
  black and white.
- Report sentiment comes from `ReportItem` snapshots. Re-scoring must never alter a sent report.
- Three distinct negative signals, never merged into one weight: unfollow (topic stops feeding),
  block source (hard filter), not-relevant (per-topic demotion).
- Nothing is silently dropped. Deduplication and clustering collapse with a visible count and an
  expand affordance.
- Report items store a **snapshot** of headline, summary and metadata — not just a foreign key.
  A report must still render correctly after the publisher edits or deletes the article.
- Every mixed-direction string (Hebrew + Latin + digits) goes through `packages/core/bidi`.
  Never concatenate them by hand — that is where RTL breaks visually.
- Classification level is enforced metadata: stamped on every page header and footer, included in
  the filename, and written to the audit log with the recipient list.
- Email sending is always queued. No route sends mail synchronously.
- Never edit `prisma/migrations/` by hand.
- All user-facing strings go through `next-intl`. Logical CSS properties only (`ms`/`me`/`ps`/`pe`),
  never `ml`/`mr`/`pl`/`pr`.

## Conventions

- Files `kebab-case.ts`; types and components `PascalCase`; functions `camelCase`.
- Typed `AppError` subclasses from `packages/core/errors.ts`. Never throw strings.
- Tests colocated as `*.test.ts`.
- Conventional commits.
