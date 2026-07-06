# CODEBASE_MAP.md — TruthLens

_Stage 0 deliverable for the Narrative Intelligence & Media Monitoring build._
_This maps the existing TruthLens app that the new capabilities will extend._

## 1. What this system is today

TruthLens is a **Next.js 14 (App Router) + TypeScript + Tailwind** app under
`truthlens/`, deployed on **Vercel** (serverless). It's a decision-support tool
that, given a URL / post / email / log, exposes infrastructure and computes a
transparent credibility-risk rating. It already contains an early,
**request-scoped** version of several Narrative-Intelligence ideas (narrative
extraction, authenticity/coordination indicators, social bot analysis, deepfake
image detection) — but with **no persistence, no ingestion, and no per-account
history**. It runs per-request and forgets.

Sibling projects in the monorepo (`backend/` FastAPI studio, `frontend/`) are a
**separate product** (Synthetic Creator Studio) and are out of scope here.

## 2. Architecture (current)

```
Browser (pages) ──fetch──► Next.js API routes (server, Node runtime) ──► free public APIs + Anthropic
                                   │
                                   ├─ in-memory + /tmp disk cache (24h, per domain)   [ephemeral]
                                   └─ optional Vercel KV / Upstash (share links, monitor snapshots)
```

- **No database.** State = `lib/cache.ts` (memory + `/tmp`, lost on cold start)
  and an optional KV (`lib/store.ts`) used only for share links + monitor
  snapshots.
- **No ingestion / scheduler / queue.** The only background job is a **Vercel
  Cron** (`/api/monitor`, daily) that re-analyzes a domain list.
- **All external calls are server-side**, wrapped in `lib/http.ts`
  (timeout + UA). Graceful degradation everywhere.
- **AI is already behind a thin boundary** per module (each `lib/*.ts` calls the
  Anthropic SDK directly) — not yet a single unified provider interface.

## 3. Pages (9) and API routes (10)

| Page | Purpose |
|---|---|
| `/` | landing / URL input |
| `/report` | full site report (calls `/api/analyze`) |
| `/tools/post` | Post Check — fact-check a post/claim/screenshot |
| `/tools/logs` | Log Analyzer |
| `/tools/email` | Email header tracer |
| `/monitor` | monitoring dashboard (browser watchlist + KV history) |
| `/checks` | gallery of shared Post Checks |
| `/embed/post` | embeddable Post Check widget |
| `/about` | methodology / how it works |

API: `analyze`, `post-check`, `insights`, `intel` (social+media), `osint`,
`logs`, `email-trace`, `monitor`, `watchlist`, `share`.

## 4. Data entities (current, all in `lib/types.ts` — no DB tables)

- `Report` (infrastructure, reputation, contentAnalysis, risk, network,
  geography, originTrace, propagation, coordination, media)
- `ContentAnalysis` — **already has** narratives, propaganda techniques,
  manipulation tactics, intent, audience
- `CoordinationResult` — Low/Med/High + signals (proto "coordinated behavior")
- `SocialResult` / `SocialAccount` — X amplification + per-account **botScore**
  (proto "authenticity score")
- `MediaResult` / `ImageVerdict` — AI/deepfake image detection
- `OperatorNetwork` (nodes/edges) — proto "campaign graph"
- `PostCheckResult`, `OsintDossier`, `LogAnalysisResult`, `EmailTraceResult`,
  `Geography`, `OriginTrace`

## 5. Done / half-done / missing (vs the target platform)

| Target-platform capability | Status in TruthLens |
|---|---|
| Ingestion layer (SourceConnector, normalized Post/Author, queue, dedup) | **Missing** — only ad-hoc fetch per request |
| Authenticity Engine (per-Author score, signal breakdown, stored) | **Half** — `lib/social.ts` scores X accounts in-request; not stored, no signal-class architecture |
| Coordinated Behavior (clusters, temporal, graph, Campaign entity) | **Half** — `lib/coordination.ts` + operator graph are heuristic + request-scoped; no clustering, no Campaign persistence |
| Narrative & sentiment (multi-lang, embeddings/clustering, volume-over-time, Manipulation Index) | **Half** — per-post narrative extraction exists; no cross-post clustering, no time series, no sentiment-by-authenticity |
| Alerts Engine (rules, dedup/cooldown, multi-channel) | **Half** — `/api/monitor` cron + webhook on risk change; no user rules, single channel |
| Dashboard/UI (Overview, Narratives, Profiles, Campaigns, Alerts) | **Partial** — `/monitor` dashboard exists; no narrative/profile/campaign screens |
| Reports & public API (OpenAPI, keys, rate limit) | **Missing** — Markdown/PDF export of a single report only |

## 6. Technical debt / constraints that affect the build

1. **Serverless has no long-running workers or persistent disk.** A real
   ingestion/polling pipeline + queue (Stage 1) does **not** fit Vercel
   functions well. Needs either scheduled functions + external queue (Upstash
   QStash) **or** a separate worker host (the repo already has a `backend/`
   FastAPI + `render.yaml` that could host workers).
2. **No database.** Stages 1–5 (Post/Author/Campaign/Narrative/Alert entities,
   time series, graph) require one. Options: Vercel Postgres / Neon / Supabase
   (SQL) — pgvector for embeddings — or keep KV for the MVP.
3. **AI calls are per-module**, not a unified provider interface (Stage principle
   #5). Small refactor needed to swap providers/rule-based.
4. **Ephemeral cache** means nothing persists between requests today.
5. **Password gate** (`middleware.ts`) protects the app; new API/UI must account
   for it (embeds/cron are already excluded).

## 7. Reuse map (what the new platform can build on)

- Narrative extraction → reuse/upgrade `lib/content-analysis.ts` + `NarrativeCard`.
- Authenticity → generalize `lib/social.ts` botScore into a signal-class engine.
- Coordination/graph → generalize `lib/coordination.ts` + `lib/network.ts` + `NetworkGraph`.
- Alerts → generalize `/api/monitor` + `lib/store.ts`.
- UI shell, design system, RTL-ready Tailwind, `MiniMap`, cards → reuse directly.
- AI boundary → wrap existing Anthropic calls in one `lib/ai/` provider interface.
