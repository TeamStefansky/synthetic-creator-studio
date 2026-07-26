# Task: Build the enrichment layer and incremental event clustering

## Context
Read `CLAUDE.md` first. P0 delivered the schema; P1 delivered ingestion — deduplicated `documents`
rows linked to watchlists via `document_matches`, with `ingestion_runs` bookkeeping. `pipeline/`
currently contains `normalize.py`, `matcher.py`, `dedup.py`. `document_enrichment`,
`stance_assessments`, `events`, `event_documents` tables exist and are empty.

This phase turns raw documents into structured signal and groups them into events. This is the
core of the product: reports are generated over events, never over raw documents.

## Objective
After ingestion, every non-duplicate document acquires an embedding, entities, geo, topics,
prominence and overall sentiment; every document matching a watchlist that has entities gets an
entity-targeted stance assessment; and documents are grouped into `events` such that ~200 articles
about one summit collapse into one event with 200 linked documents, an LLM-written title and
summary, and correct `doc_count` / `source_count`.

## Requirements
1. `pipeline/embed.py`: batched embeddings via `sentence-transformers` with
   `intfloat/multilingual-e5-large`. Prefix inputs with `passage: ` per that model's contract.
   Embed `title + "\n" + (summary or body[:2000])`. Batch size 32, run on GPU when available.
   L2-normalize before storing so cosine similarity is a dot product.
2. `pipeline/enrich.py`, cheap tier — runs on EVERY document:
   - Language confirmation, `is_opinion` heuristic (source section + URL path + title patterns).
   - `prominence` (0.0–1.0): 1.0 if the watchlist term appears in the title, 0.7 in the first
     paragraph, 0.4 in the first third of the body, 0.15 otherwise. Combine multiple hits by max.
   - Named entities: `claude-haiku-4-5-20251001` in batches of 10 documents per call, returning a
     `DocumentEnrichmentOut` Pydantic schema. Entities: person/org/place/product with offsets.
   - Geo: resolve place entities to `{country_code, admin1, lat, lon, confidence}` using a bundled
     GeoNames cities500 extract (`data/geonames_cities500.tsv`, download script in `scripts/`).
     If Perigon supplied lat/lon in `documents.raw`, trust it and skip resolution.
   - `sentiment_overall`: from the same Haiku call, −1..1.
3. `pipeline/stance.py`, targeted tier — runs only on documents matching a watchlist that has
   `watchlist_entities`, and only on documents where that entity actually appears:
   - One `claude-haiku-4-5-20251001` call per (document, entity) pair, batched up to 5 pairs per
     call, returning `StanceOut`: `stance` (−2 hostile, −1 critical, 0 neutral, +1 favorable,
     +2 laudatory), `confidence` 0–1, `evidence_span` (verbatim ≤200 chars from the document),
     `framing` (≤10 words describing the frame, e.g. "corruption probe", "security failure").
   - Write to `stance_assessments`. Upsert on (`document_id`,`entity_id`).
   - The prompt template lives in `llm/prompts/stance.md` and MUST state explicitly that the model
     is judging the posture of the text *toward the named entity*, not the emotional valence of
     the events described. Include two few-shot examples, one of them a case where the article is
     about a disaster (negative overall) but favorable toward the entity.
4. `pipeline/cluster.py`: online incremental clustering, per watchlist.
   - For each new enriched document, find candidate events via pgvector kNN on `events.centroid`
     (`ORDER BY centroid <=> :emb LIMIT 20`) restricted to the same watchlist and
     `last_seen_at > now() - interval '72 hours'`.
   - Assign to the best candidate if `cosine_similarity >= 0.82` AND the time gap to the event's
     `last_seen_at` is ≤ 48h. Otherwise create a new event.
   - Update the centroid as a time-decayed running mean:
     `centroid = normalize(centroid * decay * n + emb) ` with `decay = 0.5 ** (hours_since_last / 48)`.
     Recompute `doc_count` and `source_count` (DISTINCT `source_id`, excluding `dedup_of IS NOT NULL`).
   - Status transitions: `emerging` → `active` when `source_count >= 5`;
     `active` → `decaying` when no new document for 12h; `decaying` → `closed` after 72h idle.
   - Nightly `recluster_watchlist(watchlist_id)` job: HDBSCAN over the last 7 days of embeddings to
     repair drift; merge events whose centroids are within cosine 0.9 and whose time ranges overlap.
5. `pipeline/summarize.py`: for every event that is `active` or newly `emerging` with
   `source_count >= 3`, generate `title` (≤90 chars) and `summary` (3–5 sentences) with
   `claude-sonnet-5`, using the 8 most representative documents (closest to centroid, from
   distinct sources, preferring tier-1). Regenerate only when `doc_count` grows by ≥50% since the
   last generation. Store `model` used. Prompt in `llm/prompts/event_summary.md`.
6. `llm/client.py`: async Anthropic wrapper with concurrency limiting (semaphore, default 8),
   exponential backoff on 429/529, per-call token accounting written to a new `llm_calls` table
   (migration `0003_llm_calls`: `id, purpose, model, input_tokens, output_tokens, latency_ms,
   ok, error, created_at`), and a hard daily spend guard: if estimated spend exceeds
   `LLM_DAILY_BUDGET_USD`, the client raises `BudgetExceeded` and enrichment degrades gracefully
   (embeddings + heuristics only, documents flagged `enriched_at IS NULL`).
7. `llm/schemas.py`: all Pydantic output contracts. Every LLM call uses tool-use / structured
   output — never free-text parsing.
8. Celery tasks in `tasks/enrich.py` and `tasks/cluster.py`, chained after ingestion:
   `ingest → embed → enrich → stance → cluster → summarize`. Beat: enrichment every 5 min on
   unenriched documents, reclustering nightly at 03:00 Asia/Jerusalem.

## Technical decisions (follow these — do not re-litigate)
- Cost discipline is a functional requirement. Order of operations is fixed: embeddings and
  heuristics first (cheap, all documents) → Haiku for entities/sentiment/stance (batched) →
  Sonnet only on event representatives. Any design that sends every article to Sonnet is wrong.
- Similarity threshold 0.82 and decay half-life 48h are the starting values; expose both as
  settings (`CLUSTER_SIM_THRESHOLD`, `CLUSTER_DECAY_HALFLIFE_HOURS`) so they can be tuned without
  a code change.
- Use pgvector HNSW (already indexed in P0) for candidate lookup. Never load all centroids into
  Python.
- Documents with `dedup_of IS NOT NULL` are embedded but NOT clustered and NOT counted in metrics.
- Idempotency: re-running enrichment on an already-enriched document is a no-op unless
  `--force` is passed.

## Constraints & non-goals
- No signal/heat scoring, no reports, no alerts — that is P3.
- No API routes, no UI.
- Do not fine-tune or train any model. Do not add a vector database; pgvector is the answer.
- Do not add a generic "NLP plugin system". Concrete functions only.
- Do not change the ingestion code except to chain the new Celery tasks.

## Implementation plan
1. `llm/client.py` + `llm/schemas.py` + `llm_calls` table + migration + budget guard. Verify:
   unit tests with a mocked Anthropic client cover retry, budget exceeded, and token accounting.
2. `pipeline/embed.py` + tests (deterministic: same text → same vector; normalized to unit length).
3. `pipeline/enrich.py` (prominence, is_opinion, geo, entities, sentiment) + tests. Geo resolution
   tested offline against the bundled GeoNames extract.
4. `pipeline/stance.py` + `llm/prompts/stance.md` + tests, including the disaster/favorable-entity
   case asserted against a recorded fixture response.
5. `pipeline/cluster.py` + tests using a fixture set of 60 documents covering 4 known events —
   assert the clusterer produces exactly 4 events with correct membership (≥90% purity).
6. `pipeline/summarize.py` + `llm/prompts/event_summary.md`.
7. Celery wiring, task chain, beat entries.

## Verification (definition of done)
- `uv run pytest` — all green, all P0/P1 tests still passing.
- `uv run ruff check . && uv run mypy src/` — clean.
- Clustering quality gate: `uv run pytest tests/pipeline/test_cluster_quality.py` asserts ≥0.90
  purity and ≤4 predicted clusters on the 60-document / 4-event fixture. This test must not be
  weakened to make it pass — if it fails, fix the algorithm.
- Cost gate: `uv run python scripts/cost_report.py --hours 24` prints per-purpose token spend.
  On a run of 5,000 ingested documents, Sonnet calls must be fewer than 5% of Haiku calls.
- End-to-end scenario: ingest the demo watchlist, then
  `SELECT title, doc_count, source_count, status FROM events WHERE watchlist_id = ...
  ORDER BY last_seen_at DESC LIMIT 10` returns human-readable event titles, each backed by
  multiple distinct sources.
- Stance sanity check: `uv run python scripts/stance_audit.py --entity "<primary entity>" --limit 20`
  prints document title, stance, evidence span — a human can verify the evidence supports the score.

## Working style
One commit per numbered step, conventional commits. Never weaken a quality-gate test to make it
pass. Final report must include: total documents enriched, number of events created, the observed
average cluster size, the LLM spend for the run broken down by purpose, and the 5 lowest-confidence
stance assessments so a human can spot-check them.
