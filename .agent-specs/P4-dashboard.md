# Task: Build the NewsRadar editor dashboard (Next.js, Hebrew RTL)

## Context
Read `CLAUDE.md` first. P0–P3 delivered a working backend: FastAPI on `:8000` with typed,
paginated routes for watchlists, events, trends, geo hot zones, alerts, reports and report
schedules; OpenAPI schema at `/openapi.json`. `web/` does not exist yet.

The user is a newsroom editor, not an analyst. The dashboard's job is to answer four questions in
under ten seconds: **what is hot right now, what is new, who is being attacked, and where.**

## Objective
An editor opens `localhost:3000`, picks a watchlist, and sees a live situational picture: a ranked
heat board of events with trajectory, a trends strip, a negative-coverage panel per monitored
entity with clickable evidence, and a world hot-zone map. They can open any event to see its
document list, change the time window, and generate or download a report. Full Hebrew RTL.

## Requirements
1. Next.js 15 App Router + TypeScript strict + Tailwind + shadcn/ui. `dir="rtl"` and `lang="he"`
   on `<html>`, with a Hebrew-capable variable font (Assistant or Heebo via `next/font`).
2. **Typed API client generated from the backend OpenAPI schema** (`openapi-typescript` +
   a thin `fetch` wrapper). No hand-written response interfaces; regenerate via `npm run gen:api`.
3. Data fetching with TanStack Query. Live views poll every 60s with `refetchOnWindowFocus`.
   Show stale-data age explicitly ("עודכן לפני 2 דקות") — an editor must never mistake a frozen
   dashboard for a quiet news cycle.
4. Routes:
   - `/` — watchlist picker + global overview.
   - `/w/[watchlistId]` — the situation board (default view).
   - `/w/[watchlistId]/events/[eventId]` — event detail.
   - `/w/[watchlistId]/negative` — negative coverage view.
   - `/w/[watchlistId]/reports` — report list, viewer, schedule editor.
5. **Situation board** composition:
   - Time-window control (1h / 6h / 24h / 7d) that drives every panel on the page via URL search
     params, so a view is shareable by link.
   - **Heat board**: event cards ranked by `heat_score`, each showing title, heat (0–100 with a
     color ramp), sparkline of hourly `doc_count`, trajectory arrow derived from `acceleration`,
     `source_count`, `country_codes` as flags, and a negativity chip when
     `negativity_score > 0.5`. New-since-last-visit events carry a "חדש" badge.
   - **Trends strip**: horizontal cards of `trends` rows sorted by `lift`, showing term, lift
     multiplier, doc count, and a mini bar of the 7-day share vs. current share.
   - **Geo hot zones**: MapLibre GL map with a heat layer from the `/geo` endpoint. Clicking a zone
     filters the heat board to that country.
   - **Volume bar**: documents ingested vs. previous period, with duplicates-collapsed shown as a
     muted segment so the editor sees the real signal-to-noise.
6. **Event detail**: LLM summary, metric timeline chart (Recharts: doc_count, velocity,
   acceleration), source breakdown by tier, document table (title, source, published_at, stance
   chip, prominence) sortable and filterable, each row linking out to the original URL.
7. **Negative coverage view**: grouped by monitored entity. Per entity: negativity index gauge,
   negative document count over time, and a list of negative documents showing the
   `evidence_span` verbatim with the `framing` label and a stance chip (−2 red / −1 amber).
   Opinion pieces are shown in a visually separate section, never mixed into the main count.
8. **Reports**: list with period and generated_at; a viewer that renders stored Markdown RTL with
   `react-markdown` + `remark-gfm`; a "צור דוח עכשיו" action hitting `POST /reports/generate` with
   a section picker; PDF download; and a schedule editor (cron builder with human-readable Hebrew
   preview, section multi-select, recipients, timezone).
9. **Alerts**: a bell in the header polling `GET /alerts`, badge count of undismissed criticals,
   dropdown listing recent alerts linking to their event.
10. Accessibility and states: every panel implements loading skeleton, empty state with a plain
    Hebrew explanation of why it is empty, and an error state with retry. Color is never the sole
    carrier of meaning (stance chips carry text/icon too). Keyboard navigable. Contrast AA.

## Technical decisions (follow these — do not re-litigate)
- Server Components for initial page data, Client Components for anything interactive or polling.
- URL search params are the single source of truth for window/filters — no global state library.
  Local UI state with `useState`; no Redux, no Zustand.
- Charts: Recharts. Map: MapLibre GL with a free raster basemap (no Mapbox token).
- Number and date formatting via `Intl` with `he-IL` locale and `Asia/Jerusalem` timezone.
- All user-facing strings live in `web/src/lib/strings.ts` as a flat Hebrew dictionary. No i18n
  framework — one language, one file.
- Component files under 200 lines. If a component exceeds that, split it.
- No new UI dependency beyond: `@tanstack/react-query`, `recharts`, `maplibre-gl`,
  `react-markdown`, `remark-gfm`, `openapi-typescript`, `date-fns`, shadcn/ui primitives.

## Constraints & non-goals
- No authentication, no user profiles, no theming/dark-mode toggle (ship one polished light theme).
- No inline editing of watchlist terms in v1 — watchlists are managed via the seed script and API.
- No real-time WebSockets. Polling is sufficient and simpler to operate.
- No mobile app. The dashboard must be usable at 1280px and above; below that, degrade to a
  single-column stack rather than building a bespoke mobile layout.
- Do NOT modify any backend code. If an endpoint you need is missing or a field is absent, stop and
  report it rather than adding backend routes.

## Implementation plan
1. Scaffold `web/`: Next.js 15 + TS strict + Tailwind + shadcn/ui + fonts + RTL layout shell +
   `npm run gen:api`. Verify: `npm run build` succeeds, `npm run lint` clean, page renders RTL.
2. API client + TanStack Query provider + `strings.ts` + shared primitives (StatCard, HeatBadge,
   StanceChip, TrendArrow, EmptyState, ErrorState, Skeleton). Verify: vitest unit tests for
   HeatBadge color ramp and StanceChip mapping.
3. Watchlist picker + situation board shell with the time-window control wired to search params.
4. Heat board + trends strip.
5. Geo map + country filtering.
6. Event detail page.
7. Negative coverage view.
8. Reports list, viewer, ad-hoc generation, schedule editor.
9. Alerts bell + polish pass: loading/empty/error states everywhere, a11y audit, responsive stack.

## Verification (definition of done)
- `cd web && npm run build && npm run lint && npm run test` — all clean.
- `npx tsc --noEmit` — zero errors, strict mode.
- Manual end-to-end with the backend running and the demo watchlist seeded:
  1. Open `/`, select the demo watchlist.
  2. Switch the window from 24h to 6h — every panel refetches and the URL updates.
  3. Click the top heat card → event detail shows the timeline chart and document table.
  4. Open the negative coverage view → at least one entity shows evidence spans.
  5. Click a hot zone on the map → the heat board filters to that country.
  6. Generate an ad-hoc report → it appears in the list and renders RTL correctly; PDF downloads.
- Empty-state check: point the app at a watchlist with zero events; every panel shows its Hebrew
  empty state, no crashes, no infinite spinners.
- Backend-down check: stop the API; every panel shows its error state with a retry button.
- RTL check: no clipped or left-aligned Hebrew text, charts and the map read correctly, numbers
  and dates use `he-IL` formatting.

## Working style
One commit per numbered step, conventional commits. Run lint + typecheck before declaring done.
Do not touch anything outside `web/`. Final report must list: every backend field you consumed,
any field you needed but could not find, and the Lighthouse performance/accessibility scores for
the situation board.
