# Task: Build the reader site — English news front page, article view, and the Sources page

## Context
Read `CLAUDE.md` first, including the `## Sources & rights` and `## Reader product` sections added
by P5 and P6. P4 delivered the Hebrew analyst dashboard in `web/` (Next.js 15 App Router, TypeScript
strict, Tailwind, shadcn/ui, TanStack Query, generated OpenAPI client). P5 delivered sources, batch
onboarding, `document_media` (OG image, byline, favicon, `frameable`) and keyword+country interests.
P6 delivered translation to English, immutable editions, `to_story_out` serialization, the headline
email digest, share links and RSS/Atom/JSON feed output.

This phase builds what the reader actually sees. It is an English, LTR news site — a different
product surface from the Hebrew RTL analyst dashboard, living in the same Next.js app.

## Objective
The user opens `/site` and reads a news site made of their sources: English headlines regardless of
the source language, article-grade cards with the source's own image and branding, and a story page
that can display the original article itself. On `/sources` they paste 150 site URLs at once and
watch them resolve. They can email themselves a headline digest and hand a colleague a share link.

## Requirements

### Presentation rules (non-negotiable — these are legal, not stylistic)
1. Every story card and story page must show: the source's name, the source's favicon, the publish
   time, and a visible outbound link to the original. Attribution is never truncated, collapsed
   behind a menu, or de-emphasized.
2. Never render more text than the API returned. `extract_en` is already capped server-side by the
   source's rights tier — render it as-is, never concatenate it with `blurb` to look longer, never
   call any other endpoint to enrich it.
3. Never use `dangerouslySetInnerHTML` with source-derived content.
4. Images are hotlinked from `image_url` with `referrerPolicy="no-referrer-when-downgrade"` and a
   graceful fallback tile. Never proxy, cache, download or upload them.
5. The **original article view**: on a story page, when `frameable === true`, render the original
   URL in a sandboxed `<iframe>` (`sandbox="allow-scripts allow-same-origin allow-popups"`,
   `loading="lazy"`, `referrerPolicy="strict-origin-when-cross-origin"`) inside a labelled frame
   that reads `Original article — {source_name}` with an "Open on {source_name}" button above it.
   This displays the publisher's own page from the publisher's own server — that is the point.
   When `frameable` is `false` or `null`, or the iframe fails to load within 4 seconds, fall back to
   the translated card view with a large "Read the full article on {source_name}" call to action.
   Never screenshot, never scrape into the frame, never strip the publisher's chrome.

### Routes
6. Under a new route group `web/src/app/(reader)/` with its own LTR English layout:
   - `/site` — the front page (current edition).
   - `/site/story/[type]/[id]` — story page.
   - `/site/archive` — past editions by date.
   - `/site/digest` — digest list, viewer, download, generate-now, schedule editor.
   - `/sources` — source management.
   - `/interests` — keyword + country interest management.
   - `/share` — share-link management.
   - `/p/[token]` — public shared view, read-only, no nav to settings.
   The existing P4 dashboard moves under `(dashboard)` unchanged. A small header switcher toggles
   between "News" and "Monitoring"; the reader surface is English/LTR, the dashboard stays Hebrew/RTL
   (set `dir` and `lang` per route group layout, not globally).

### Front page
7. Editorial hierarchy, not a uniform grid:
   - Lead story: large image, translated headline, blurb, source strip.
   - A 3-up row of the next `top` items.
   - One block per interest section: section title, a lead item, then a compact headline list.
   - Every item shows the API's `reason` line as muted secondary text
     (`Ukraine energy · 9 sources · 2h ago`).
   - Items whose `source_lang !== 'en'` show a small "Translated from {language}" tag; hovering or
     tapping it reveals `headline_original` in the source script (RTL-correct for Hebrew/Arabic —
     set `dir="auto"` on that element).
   - Event-backed items show a "{n} sources" chip linking to the story page's coverage list.
   - Header shows the edition timestamp ("Edition 14:30") and a refresh button calling
     `POST /site/refresh`. A newer edition surfaces an unobtrusive "New edition available" bar —
     the page never reloads itself under the reader.
8. Filter bar bound to URL search params (so any view is shareable): interest multi-select, country
   multi-select (with flags), source-vs-subject country toggle mirroring the API's
   `country_match_mode`, and a time window (6h / 24h / 3d). Label the country toggle in plain
   language — "Published in" vs "About" — this is the concept users get wrong.

### Story page
9. Translated headline, `headline_original` beneath it when different, byline, source strip with
   favicon and country, publish time, hero image, blurb, `extract_en`, and the outbound CTA.
10. For event-backed stories, a **Coverage** timeline: every source that covered it, ascending by
    publish time, each with country flag and its own outbound link — so the reader sees who broke it
    first and how it spread.
11. The original-article frame per rule 5 above.

### Sources page
12. Two tabs:
    - **My feeds** — a large textarea accepting up to 500 pasted lines (bare domains, full URLs,
      mixed separators), plus an OPML drag-and-drop, plus a single "Add site" input that calls
      `POST /feeds/discover` and shows candidate feeds to pick from. Submitting the batch calls
      `POST /sources/batch`, then polls `GET /sources/batch/{job_id}` and streams results into a
      live table with per-line status chips (`added` / `duplicate` / `no feed found` / `invalid` /
      `error`) and a progress bar. Failed lines are copyable back out as text for a retry.
    - **Global sources** — the `api_sources` list (GDELT, Perigon): enable/disable, country scope
      multi-select, language scope. Perigon shows as unavailable with an explanatory note when no
      API key is configured.
13. Subscription table: title, domain, country, tags (editable chips), last successful poll, failure
    count, active toggle, and a **rights** column. Rights display as a plain-language badge —
    `Headline + link` / `Short extract` / `Full text (licensed)`. Changing to "Full text (licensed)"
    opens a dialog that requires typing a justification note (the API rejects it without one) and
    shows a short warning that this asserts the user has permission. Default state for every new
    source is `Headline + link` and the UI never suggests upgrading.
14. Feeds with `consecutive_failures >= 3` flagged amber; auto-deactivated ones red with a reactivate
    action. Bulk select → deactivate / delete / tag / export OPML.

### Interests page
15. Create an interest with: name, a free-text English description, optional keyword chips,
    "Published in" countries, "About" countries, match mode, and a similarity slider (0.70–0.90)
    labelled `Broad ← → Precise`. A live preview panel shows the 5 most recent matches, debounced
    800ms, refetching from `GET /interests/{id}/preview` as the description or slider changes. This
    is how the user calibrates — make it prominent, not hidden in an accordion.

### Digest and sharing
16. `/site/digest`: list by date, Markdown viewer (`react-markdown` + `remark-gfm`), PDF and
    Markdown download, "Generate now" calling `POST /reports/generate` with
    `report_type=headline_digest`, and a schedule editor (hour, timezone, recipients, lookback,
    active toggle) writing to `/report-schedules`.
17. `/share`: create a share link (scope: whole site / this edition / one interest), copy button,
    QR code, optional expiry date, view count, revoke action with confirmation. Also expose the
    three feed URLs (`/site/feed.rss`, `.atom`, `.json`) with copy buttons.
18. `/p/[token]`: the same front page and story components in read-only mode — no settings nav, no
    refresh button, no filter persistence. A revoked or expired token renders a clean "This link is
    no longer active" page, not an error boundary.

### Quality
19. Every panel implements a skeleton matching its editorial shape, an empty state that explains
    cause and fix ("No edition yet — add sources and interests to get started", linking to
    `/sources`), and an error state with retry. An edition older than 90 minutes shows a muted
    staleness strip.
20. Reading ergonomics: content column ~72ch, generous line-height, a serif or humanist face for
    headlines (e.g. Source Serif 4) and a clean sans for UI chrome. The dashboard's dense data
    aesthetic must NOT be copied here. Read/unread state persisted in `localStorage` by story id
    (the only client-side persistence permitted); read items dim slightly. Keyboard: `j`/`k` move,
    `Enter` opens the story page, `o` opens the source, `/` focuses filters.

## Technical decisions (follow these — do not re-litigate)
- Reuse the P4 foundation: same app, same generated client (`npm run gen:api`), same TanStack Query
  setup. Strings for the reader surface live in `web/src/lib/strings.en.ts`; the dashboard keeps its
  Hebrew dictionary. No i18n framework — two flat dictionaries, one per surface.
- Front page and story page are Server Components for first paint; refresh, filters, read-state,
  keyboard nav, the iframe fallback timer and all curation forms are Client Components.
- Batch import polling uses TanStack Query with a 1s interval, stopping on terminal job status.
- No infinite scroll and no background auto-refresh of a page being read.
- New dependencies allowed, and only these: `qrcode.react` for the share QR, `react-dropzone` only
  if a plain `<input type="file">` proves insufficient for OPML. Nothing else.
- Do NOT modify any backend code. If a field or endpoint is missing, stop and report it.

## Constraints & non-goals
- No authentication, no accounts, no per-user preferences beyond `localStorage` read-state.
- No comments, no bookmarking, no offline/PWA, no dark-mode toggle. One polished light theme.
- No dashboard changes beyond moving its routes into the `(dashboard)` group. Do not edit its
  components or styling.
- Never build a "read here" mode that renders article bodies the API did not supply. The iframe
  shows the publisher's page; the card shows the capped extract. There is no third option.

## Implementation plan
1. Route groups `(reader)` / `(dashboard)` with per-group `dir`/`lang`, reader layout and
   typography, header switcher, `strings.en.ts`. Verify: `npm run build` clean, dashboard routes
   render identically to before.
2. Shared reader primitives: `StoryCard`, `SourceStrip`, `TranslationTag`, `CoverageChip`,
   `ReasonLine`, `ImageWithFallback`, empty/error/skeleton components. Vitest unit tests for the
   translation tag and the extract-length guard.
3. Front page: edition fetch, lead / 3-up / interest sections, filter bar bound to search params,
   refresh, new-edition bar, staleness strip.
4. Story page: header, coverage timeline, and the original-article iframe with the 4s fallback timer.
5. `/sources`: batch paste + job polling + results table, discovery flow, OPML, subscription table
   with the rights badge and justification dialog, global API sources tab.
6. `/interests`: form, country selectors, similarity slider, debounced live preview.
7. `/site/digest` + `/share` + feed URL copy.
8. `/site/archive`, `/p/[token]` read-only mode, read-state, keyboard nav, a11y and polish pass.

## Verification (definition of done)
- `cd web && npm run build && npm run lint && npm run test && npx tsc --noEmit` — all clean, strict.
- All P4 dashboard routes still build and render identically (visual spot-check of `/w/[id]`).
- **Attribution gate:** `web/src/__tests__/attribution.test.tsx` asserts every story-rendering
  component outputs a source name, a favicon slot and an external
  `<a target="_blank" rel="noopener noreferrer">`, in both the front-page card and the story page,
  and in the public `/p/` variants. Do not weaken it.
- **Extract gate:** `web/src/__tests__/extract-length.test.tsx` asserts no component renders a text
  node built from `extract_en` longer than what the API supplied, and that `extract_en` and `blurb`
  are never concatenated into one node.
- **Frame gate:** `web/src/__tests__/original-frame.test.tsx` — `frameable: true` renders the iframe
  with the required sandbox attributes; `false` and `null` render the fallback CTA and no iframe.
- Manual end-to-end with the backend running:
  1. `/sources` → paste 20 mixed-format lines → progress bar advances, per-line statuses appear,
     failed lines are copyable.
  2. Set one source to "Full text (licensed)" without a note → the dialog blocks submission.
  3. `/interests` → create an interest with an English description, "About" = `UA, PL` → preview
     populates; moving the slider to Precise reduces the count.
  4. `/site` → lead story renders with image and source strip; a Hebrew-source item shows
     "Translated from Hebrew" and reveals the original headline RTL-correct.
  5. Story page → coverage timeline lists sources chronologically; the original article renders in
     the frame for a frameable source and falls back cleanly for a blocking one.
  6. `/site/digest` → Generate now → English digest renders → PDF downloads.
  7. `/share` → create a link → open `/p/{token}` in a private window → same stories, no settings
     nav → revoke → the page shows "This link is no longer active".
- Empty-state check: zero sources and zero interests → `/site` shows onboarding with a link to
  `/sources`; no crash, no spinner loop.
- Backend-down check: every page shows its error state with retry.
- Keyboard check: `j`/`k`/`Enter`/`o`/`/` all work without a mouse; focus ring always visible.
- Lighthouse on `/site`: performance ≥85, accessibility ≥95.

## Working style
One commit per numbered step, conventional commits. Work only inside `web/`. Run lint, typecheck and
tests before declaring done. Final report: every backend field consumed, any field needed but
missing, Lighthouse scores for `/site` and `/site/story/...`, the observed frameable rate across the
seeded sources, and any place where the editorial typography had to compromise to fit an existing
shadcn primitive.
