# Task: Build the personal news site and curation UI (Next.js, Hebrew RTL)

## Context
Read `CLAUDE.md` first. P4 delivered the analyst dashboard in `web/` (Next.js 15 App Router,
TypeScript strict, Tailwind, shadcn/ui, TanStack Query, generated OpenAPI client, RTL layout shell,
Hebrew strings in `web/src/lib/strings.ts`). P5 delivered the backend for this phase:
`/site/edition/current`, `/site/editions`, `/site/story/{type}/{id}`, `/site/refresh`,
`/feeds` (+ discover, import-opml, export-opml, health), `/topics`, and daily-digest reports via
the existing `/reports` routes with `report_type=daily_digest`.

This phase builds the reading surface: a personal news front page, plus the curation screens for
feeds and topics. It lives in the same Next.js app as the dashboard but is a distinct experience —
the dashboard is an instrument panel, this is a newspaper.

## Objective
The user opens `/site` and reads a clean, stable front page built from their own feeds and topics:
a lead story, topic sections, and a "why am I seeing this" line on every item. They can add feeds by
pasting a site URL, import an OPML, define topics in plain Hebrew, and open, read and download the
daily digest.

## Requirements
1. Routes, all under the existing app:
   - `/site` — the front page (current edition).
   - `/site/story/[type]/[id]` — story detail.
   - `/site/archive` — past editions, browsable by date.
   - `/site/digest` — digest list + viewer + download.
   - `/settings/feeds` — feed curation.
   - `/settings/topics` — topic curation.
   A persistent header switches between **"העיתון שלי"** (`/site`) and **"ניטור"** (`/w/...`).
2. **Front page layout** — a real editorial hierarchy, not a uniform card grid:
   - Lead story: the top-scoring item, large, with blurb and source.
   - Below it, a 3-up row of the next-ranked items from the `top` section.
   - Then one block per topic section: topic name, a lead item, and a compact list of the rest.
   - Each item shows: title, source name + favicon, relative time, and the `reason` string from the
     API as muted secondary text ("נושא: רגולציית AI · 7 מקורות · לפני שעתיים").
   - Items backed by an event show a corroboration chip ("7 מקורות") that opens the story detail.
   - Header shows the edition timestamp ("מהדורה 14:30") and a refresh action calling
     `POST /site/refresh` with an optimistic pending state.
3. **Story detail**: title, source, published time, the ≤400-char extract, blurb, a prominent
   outbound link ("קרא במקור") that opens in a new tab with `rel="noopener noreferrer"`, and — for
   event-backed stories — the list of all sources that covered it with their own outbound links and
   publish times, sorted chronologically so the user can see who broke it first.
4. **Feed curation** (`/settings/feeds`):
   - "הוסף אתר" input accepting any site URL → calls `POST /feeds/discover` → shows discovered feeds
     with title, item count and last-published, each with an "הוסף" button.
   - OPML import via drag-and-drop file input; OPML export button.
   - Table of subscriptions: title, domain, tags (editable chips), last successful poll, failure
     count, active toggle. Feeds with `consecutive_failures >= 3` are visually flagged amber;
     auto-deactivated feeds red with a reactivate action.
   - Bulk select → deactivate / delete / tag.
5. **Topic curation** (`/settings/topics`):
   - Create a topic with a name and a free-text Hebrew description ("מה מעניין אותך בנושא הזה?"),
     plus optional keyword chips. Make clear in the UI copy that the description alone is enough —
     matching is semantic.
   - A `min_semantic_similarity` slider (0.70–0.90) with a plain-language label
     ("רחב" ← → "מדויק"), defaulting to the API value.
   - Per topic, show a live preview: the 5 most recent matching items, refetched when the
     description or threshold changes (debounced 800ms). This is how the user calibrates.
   - Edit and delete with a confirmation dialog.
6. **Digest** (`/site/digest`): list of past digests by date; viewer rendering stored Markdown RTL
   with `react-markdown` + `remark-gfm`; download as PDF and Markdown; a "צור עכשיו" action calling
   `POST /reports/generate` with `report_type=daily_digest`; and a schedule editor (hour picker,
   recipients, active toggle) writing to `/report-schedules`.
7. **Reading ergonomics** — this surface is read, not scanned:
   - Content column max-width ~72ch, generous line-height, a serif or humanist Hebrew face for
     headlines and body (Frank Ruhl Libre for headlines, Assistant for UI chrome), clear typographic
     scale. The dashboard's dense data aesthetic must NOT be copied here.
   - Read/unread state persisted in `localStorage` keyed by story id; read items dim slightly.
     This is the only client-side persistence permitted.
   - Keyboard navigation: `j`/`k` move between items, `Enter` opens, `o` opens the source.
8. States: skeleton loaders matching the editorial layout (not generic bars), Hebrew empty states
   that explain the cause and the fix ("עדיין אין מהדורה — הוסף פידים ונושאים כדי להתחיל"), and an
   error state with retry. A stale edition (>90 minutes old) shows a muted warning strip.

## Technical decisions (follow these — do not re-litigate)
- Reuse the P4 foundation: same Next.js app, same generated API client (`npm run gen:api`), same
  TanStack Query setup, same `strings.ts` dictionary (extend it; do not create a second file).
- Front page is a Server Component fetching the current edition; interactive pieces (refresh,
  read-state, keyboard nav, curation forms) are Client Components.
- Route group `web/src/app/(site)/` for the reading surface with its own `layout.tsx` and
  typography, `(dashboard)` for the existing P4 routes. Shared primitives stay in
  `web/src/components/ui/`.
- No infinite scroll and no auto-refresh of the front page while the user reads. An edition is
  stable until the user explicitly refreshes or navigates. If a newer edition exists, show an
  unobtrusive "מהדורה חדשה זמינה" bar.
- Never render `dangerouslySetInnerHTML` with source content. Extracts render as plain text.
- Favicons via `https://www.google.com/s2/favicons?domain=` with a letter-avatar fallback; never
  block render on them.
- No new dependency beyond what P4 already installed, except `react-dropzone` for OPML import if
  a plain `<input type="file">` proves insufficient — try the plain input first.

## Constraints & non-goals
- Do NOT modify any backend code. If a field or endpoint you need is missing, stop and report it.
- No authentication, no multi-user, no per-user preferences beyond `localStorage` read-state.
- No comments, sharing, bookmarking, offline mode, or PWA install.
- No dark mode toggle. Ship one polished light theme.
- Do not change the P4 dashboard routes, components, or styling. Extending `strings.ts` and adding
  shared primitives is allowed; editing existing dashboard components is not.
- Never display more than the 400-character extract the API returns, and never hide or de-emphasize
  the outbound source link. Attribution is a product requirement.

## Implementation plan
1. Route groups `(site)` and `(dashboard)`, site `layout.tsx` with reading typography, header
   switcher, extended `strings.ts`. Verify: `npm run build` clean; existing dashboard routes render
   unchanged.
2. Front page: edition fetch, lead/3-up/topic-section layout, item card with `reason` line and
   corroboration chip, refresh action, stale-edition strip.
3. Story detail incl. the chronological source list for event-backed stories.
4. `/settings/feeds`: discovery flow, OPML import/export, subscription table, health flags, bulk
   actions.
5. `/settings/topics`: create/edit, description + keywords, similarity slider, debounced live
   preview.
6. `/site/digest`: list, viewer, downloads, generate-now, schedule editor.
7. `/site/archive` + read-state + keyboard navigation + empty/error/skeleton states + a11y pass.

## Verification (definition of done)
- `cd web && npm run build && npm run lint && npm run test && npx tsc --noEmit` — all clean, strict.
- All P4 dashboard routes still build and render identically (visual spot-check of `/w/[id]`).
- **Attribution gate:** `web/src/__tests__/attribution.test.tsx` asserts that every story-rendering
  component outputs a source name and an outbound `<a target="_blank" rel="noopener noreferrer">`,
  and that no component renders a text node longer than 400 characters from API extract fields.
  Do not weaken it.
- Manual end-to-end with the backend running and P5's demo feeds/topics seeded:
  1. `/settings/feeds` → paste `https://www.themarker.com` → discovered feed appears → add it.
  2. Import an OPML with 10 feeds → all 10 appear; export → the file round-trips.
  3. `/settings/topics` → create a topic with only a Hebrew description → the live preview populates
     within a few seconds; moving the slider to "מדויק" reduces the preview count.
  4. `/site` → lead story renders, each item shows a Hebrew `reason` line, refresh produces a new
     edition timestamp.
  5. Click a corroboration chip → story detail lists every covering source with times.
  6. `/site/digest` → generate now → Hebrew digest renders RTL → PDF downloads and opens correctly.
- Empty-state check: with zero feeds and zero topics, `/site` shows the onboarding empty state with
  a link to `/settings/feeds` — no crash, no spinner loop.
- Backend-down check: every page shows its error state with retry.
- Keyboard check: `j`/`k`/`Enter`/`o` work on the front page without a mouse; focus ring visible.
- Lighthouse on `/site`: performance ≥85, accessibility ≥95.

## Working style
One commit per numbered step, conventional commits. Work only inside `web/`. Run lint, typecheck and
tests before declaring done. Final report must list: every backend field consumed, any field you
needed but could not find, the Lighthouse scores for `/site`, and any place where you had to
compromise the editorial typography to fit an existing shadcn primitive.
