# Roadmap — Narrative Intelligence platform

Per the master build plan. Each stage is a separate PR, feature-flagged, with
reversible migrations and tests. Stop-for-approval between stages.

- [x] **Stage 0 — Onboarding.** `truthlens/docs/CODEBASE_MAP.md`, integration plan.
- [x] **Stage 1 — Ingestion layer.** `SourceConnector` interface; X (real+mock),
  Telegram/RSS/NewsAPI connectors; normalized `Post`/`Author`; idempotent dedup;
  dead-letter + run tracking; scheduler worker; REST API; migrations; tests.
- [x] **Stage 2 — Authenticity Engine.** Per-`Author` score 0–100 from independent
  signal classes (age vs volume, follower ratio, profile completeness, posting
  cadence/bursts, content repetition, AI-avatar hook). Weights in
  `app/authenticity/weights.json`; per-signal breakdown (score/confidence/
  explanation) stored in `author_signals` for the "why suspicious" UI. Combined
  weighted by weight×confidence so no-data signals don't skew. API:
  `POST /api/authenticity/run`, `GET /api/authors/{id}`.
- [ ] **Stage 3 — Coordinated behaviour.** Cluster identical/near-identical content
  in tight time windows (uses the stored `content_hash`); temporal sync;
  relationship graph; `Campaign` entity with saved evidence.
- [ ] **Stage 4 — Narratives & sentiment.** Enrichment (lang → sentiment →
  entities → narrative assignment); narrative clustering (embeddings/Claude);
  volume-over-time; **Manipulation Index** (% engagement from low-authenticity
  accounts). English first.
- [ ] **Stage 5 — Alerts engine.** User rules (volume spike, new narrative,
  manipulation jump, monitored-entity mention, new campaign); dedup + cooldown;
  channels (in-app/email/webhook).
- [ ] **Stage 6 — Dashboard/UI.** Overview, Narratives, Profiles, Campaigns,
  Alerts — built into the existing TruthLens Next.js app, calling this API.
- [ ] **Stage 7 — Reports & public API.** PDF/HTML report (Claude exec summary);
  documented OpenAPI with API keys + rate limiting.

## Deferred / decisions to revisit
- **AI provider interface** — wrap Anthropic behind one `ai/` interface so a
  local/rule-based provider can be swapped in (principle from the brief).
- **pgvector** for narrative embeddings — enable in Stage 4 on Postgres.
- **Queue** — the worker is an interval scheduler for the MVP; move to Upstash
  QStash / a real queue if throughput demands it.
