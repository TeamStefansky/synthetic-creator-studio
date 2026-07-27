# Task: Build translation, editions, the email digest, and shareable public access

## Context
Read `CLAUDE.md` first, including the `## Sources & rights` section P5 added. P5 delivered: the
three-tier `sources.content_rights` model (`link_only` default), `document_media` (OG image, byline,
site name, favicon, frameability), batch RSS onboarding, `api_sources` for GDELT/Perigon scoped by
country, and interests (`watchlists.kind='interest'`) matched by keywords **and** by source-country
vs. subject-country filters, with hybrid keyword+semantic matching.

This phase turns matched documents into the product the reader sees: everything translated to
English, assembled into stable editions, emailed as a headline digest, and shareable by link. The
site UI is P7. The analyst monitoring product stays unchanged.

ASSUMPTION: the reader's language is English. Source content is multilingual (Hebrew, Arabic,
Russian, French, Spanish, German and more) and must all arrive in English.
ASSUMPTION: single profile. Share links are unauthenticated but unguessable and revocable.

## Objective
Every item that reaches the reader has an English headline and English extract, regardless of source
language, produced once and cached forever. `GET /site/edition/current` returns a stable, ranked,
source-diverse English front page. Every morning at 07:00 the user receives an email listing every
headline matching their keywords and countries, grouped by interest, each linking to the original.
They can generate a share link that lets a colleague read the same site without an account.

## Requirements

### Translation
1. New table `translations` (migration `0006_reader`): `id`, `document_id` fk cascade,
   `target_lang` varchar8, `field` enum (`title|extract|body`), `source_lang` varchar8,
   `text` text, `model` text, `content_hash` char64, `created_at`.
   Unique on (`document_id`, `target_lang`, `field`). `content_hash` is sha256 of the source text —
   if the source text is unchanged, never re-translate.
2. `translate/service.py`: `translate_documents(doc_ids, target_lang='en')`.
   - Skip documents whose `lang` already equals the target — copy through with
     `model='passthrough'`, do not spend a token.
   - Translate `title` always; `extract` always; `body` **only when the source's `content_rights`
     is `full_ok`**. Never translate a body the system is not permitted to store — enforce this in
     the service, not at the call site.
   - Batch up to 12 documents per `claude-haiku-4-5-20251001` call using structured output
     (`TranslationBatchOut` in `llm/schemas.py`).
   - The prompt (`llm/prompts/translate.md`) must instruct: journalistic register, preserve proper
     nouns and organization names in their conventional English form, keep numbers/dates/units
     exactly, do not summarize or editorialize, do not add context the source did not state, and
     return the source language it detected. Include one Hebrew→English and one Arabic→English
     few-shot example.
   - Failures degrade gracefully: the item keeps its original-language text with
     `translation_status='failed'` surfaced in the API, never a blank headline.
3. Translation runs only on documents entering an edition or a digest — never on the whole corpus.
   This is a hard cost rule, tested in the cost gate below.

### Ranking and editions
4. `site/ranking.py` — `personal_score` 0–100:
   ```
   score = 100 * sigmoid(
       0.30 * interest_affinity   # max match_score across the user's interests
     + 0.25 * recency             # exp decay, half-life EDITION_RECENCY_HALFLIFE_HOURS (default 8)
     + 0.20 * corroboration       # normalized source_count of the story's event
     + 0.15 * source_trust        # sources.tier + credibility_score
     + 0.10 * heat                # events.heat_score, 0 for singletons
   )
   ```
   Weights in `site/weights.py` as one documented dict. Deterministic — no randomness.
5. `site/edition.py` — an **edition** is an immutable front-page snapshot.
   - A **story** is an `events` row when `source_count >= 2`, otherwise a standalone canonical
     `documents` row. A document already inside an event is never emitted separately.
   - Candidate pool: documents from the user's `feed_subscriptions` and `api_sources` that match at
     least one `kind='interest'` watchlist, published within `EDITION_LOOKBACK_HOURS` (default 36),
     excluding `dedup_of IS NOT NULL`.
   - Diversity constraints enforced at selection time: no two items from the same event; no single
     source exceeds `EDITION_MAX_SOURCE_SHARE` (default 0.30); each interest with any qualifying
     candidate gets at least 2 slots; remainder filled by global `personal_score`.
   - Sections: `top` (10 highest-scoring overall), then one per interest ordered by aggregate score.
   - New tables `editions` (`id`, `generated_at`, `lookback_hours`, `item_count`, `config_snapshot`
     jsonb) and `edition_items` (`edition_id` fk cascade, `position`, `section`, `story_type` enum
     `event|document`, `event_id` nullable fk, `document_id` nullable fk, `personal_score`,
     `reason` text, `blurb` text nullable; composite pk (`edition_id`,`position`); CHECK that
     exactly one of `event_id`/`document_id` is non-null).
   - `reason` is a short English explanation of placement, e.g.
     `Ukraine energy · 9 sources · 2h ago`. Every item must have one.
   - Celery beat `build_edition` every `EDITION_INTERVAL_MINUTES` (default 30). Editions are never
     mutated after creation. `current` = most recent.
   - Translation is invoked for an edition's items **before** the edition row is committed, so a
     published edition is never partially translated.
6. `site/blurb.py` — a 1–2 sentence English blurb for the top 15 items only, via
   `claude-haiku-4-5-20251001`, from the translated title + extract. Reuse the P2 event summary when
   the story is an event that already has one (translate it if needed). Never call an LLM for the
   long tail.

### Serialization — the legal chokepoint
7. `site/serializers.py::to_story_out` is the ONLY function that builds a story payload. Every site
   and share route goes through it. It emits: `id`, `story_type`, `headline_en`, `headline_original`,
   `source_lang`, `extract_en` (length capped by the source's `content_rights`: 300 for `link_only`,
   400 for `extract_ok`), `blurb`, `source_name`, `source_domain`, `source_country`, `favicon_url`,
   `image_url`, `image_alt`, `byline`, `published_at`, `url` (the original), `frameable`,
   `reason`, `personal_score`, and for event-backed stories a `coverage` array of
   `{source_name, url, published_at, source_country}` sorted ascending by time.
   It NEVER emits `documents.body` unless `content_rights = 'full_ok'`, and never emits a translated
   body under any other tier. Enforce with a single guard inside the serializer.

### Email digest
8. Extend `report_schedules` and `reports` with `report_type` enum (`analyst | headline_digest`),
   default `analyst`. Existing analyst reports keep working unchanged.
9. `reports/digest_builder.py` — builds a `DigestContext` for the last N hours with no LLM involved:
   for each interest, every matching story with translated headline, source, country, time and
   original URL; the count of items suppressed as duplicates; the top 3 fastest-rising interests
   (reuse `signals/trends.py`); stories the user's own feeds carried that no tier-1 global source
   did; and any subscription that failed to poll. This is a **headline digest** — completeness of
   headlines matters more than prose.
10. `reports/digest_renderer.py` — one `claude-sonnet-5` call over `DigestContext` producing English
    Markdown. Prompt in `llm/prompts/headline_digest.md`. It must: open with a ≤80-word summary of
    the period, then list **every** headline supplied grouped by interest (never sample or omit —
    if the context has 140 headlines, all 140 appear), link each to its original URL with the source
    name and country, invent no fact or number, and state plainly when an interest had nothing.
11. HTML email via Jinja2 with an inlined-CSS, LTR, mobile-safe template (tables, no flexbox — email
    clients). PDF via the existing weasyprint path. Delivery reuses `reports/delivery.py` with retry
    and `delivery_error` recording. Seed one schedule: `0 7 * * *`, `Asia/Jerusalem`,
    `headline_digest`, 24h lookback.

### Sharing
12. New table `share_links`: `id`, `token` char43 unique (256-bit, `secrets.token_urlsafe(32)`),
    `scope` enum (`site | edition | interest | digest`), `target_id` uuid nullable,
    `label`, `expires_at` nullable, `revoked_at` nullable, `view_count` int default 0,
    `last_viewed_at`, `created_at`.
13. Public router `api/routers/public.py`, mounted at `/p`, no auth, strict rate limit
    (60 req/min per IP via a Redis token bucket):
    `GET /p/{token}` → the shared edition or interest feed, `GET /p/{token}/story/{type}/{id}`.
    Responses go through `to_story_out` like everything else. A revoked or expired token returns 410.
    Increment `view_count` asynchronously; never block the response on it.
14. Personal feed output: `GET /site/feed.rss`, `/site/feed.atom`, `/site/feed.json` (JSON Feed 1.1)
    and the same under `/p/{token}/feed.rss`. Each entry: translated headline, blurb, source
    attribution, and `<link>` to the **original article** — never to an internal page. This is the
    correct way for the user to share or pipe their site elsewhere.

### API
15. `api/routers/site.py`: `GET /site/edition/current`, `GET /site/editions`,
    `GET /site/editions/{id}`, `GET /site/story/{story_type}/{id}`, `POST /site/refresh`,
    the three feed formats, and `GET/POST/DELETE /share-links` (+ `POST /share-links/{id}/revoke`).

## Technical decisions (follow these — do not re-litigate)
- Translation cache is keyed by content hash, not by document id alone. Re-ingesting the same
  article must never cost a second translation.
- Editions are immutable snapshots, not live queries. This is what keeps the page stable while
  someone reads it and what makes a digest reproducible.
- Never feed raw article bodies to the digest model. It sees the structured `DigestContext` only —
  a cost control and a hallucination control at once.
- All new settings in `config.py`: `EDITION_INTERVAL_MINUTES=30`, `EDITION_SIZE=60`,
  `EDITION_LOOKBACK_HOURS=36`, `EDITION_RECENCY_HALFLIFE_HOURS=8`, `EDITION_MAX_SOURCE_SHARE=0.30`,
  `READER_TARGET_LANG=en`, `DIGEST_HOUR=7`, `PUBLIC_RATE_LIMIT_PER_MIN=60`.
- Reuse P2 events for corroboration and dedup. Do not build a second clustering path.

## Constraints & non-goals
- No frontend — that is P7.
- No user accounts, no login, no per-user personalization. Share links are the only external access.
- No click tracking, no learned ranking, no recommendation model. `reason` must always explain
  placement in plain English.
- No image downloading, caching, or re-hosting. `image_url` is passed through for hotlinking.
- Do NOT modify the analyst path. P3 signal gates and analyst report tests are the regression suite.

## Implementation plan
1. Migration `0006_reader`: `translations`, `editions`, `edition_items`, `share_links`,
   `report_type` on schedules and reports. Verify: up/down/up clean, existing suite green.
2. `translate/service.py` + `llm/prompts/translate.md` + schemas + tests (passthrough for English,
   cache hit on re-translate, `full_ok`-only body rule, graceful failure).
3. `site/ranking.py` + `site/weights.py` + determinism test.
4. `site/edition.py` + diversity constraints + beat task + translation-before-commit ordering.
5. `site/serializers.py` + the rights guard.
6. `site/blurb.py`.
7. Digest builder + renderer + email template + PDF + schedule handling + seeded 07:00 schedule.
8. Share links + public router + rate limiting + RSS/Atom/JSON Feed output.
9. Site API routes.

## Verification (definition of done)
- `uv run pytest` — all green. **Every P0–P5 test passes unmodified.**
- `uv run ruff check . && uv run mypy src/` — clean.
- **Rights gate:** `tests/site/test_no_fulltext_leak.py` walks every route under `/site/` and `/p/`
  with fixtures at all three rights tiers and asserts: `body` never appears for `link_only` or
  `extract_ok`; no `extract_en` exceeds its tier's cap; no translated body exists for a non-`full_ok`
  source. Do not weaken it.
- **Attribution gate:** every story payload from every route contains a non-empty `source_name` and
  an absolute external `url`. Asserted by walking the OpenAPI-described routes.
- **Translation gates:** an English-source document produces `model='passthrough'` and zero LLM
  calls; re-running translation on unchanged text produces zero new LLM calls; a Hebrew and an
  Arabic fixture both yield English headlines with proper nouns preserved (recorded fixtures).
- **Cost gate:** `uv run python scripts/cost_report.py --hours 24` — on a run with 5,000 ingested
  documents and a 60-item edition, translation calls cover at most 120 documents (edition + digest
  scope), and Sonnet calls are fewer than 2% of Haiku calls.
- **Diversity + determinism gates:** on a fixture where one source produced 40 of 100 candidates,
  that source holds ≤30% of the edition and no event appears twice; building the edition twice from
  the same fixture and a frozen clock produces identical ordering.
- **Digest completeness gate:** `tests/reports/test_digest_completeness.py` — a `DigestContext` with
  140 headlines produces markdown containing all 140 source URLs. The renderer must not sample.
- **Share gates:** a valid token returns the edition; a revoked token returns 410; an expired token
  returns 410; 61 requests in a minute from one IP returns 429.
- End-to-end scenario:
  1. Seed 20 feeds across 6 countries in 4 languages + 3 interests with country filters.
  2. Run ingestion → `POST /site/refresh`.
  3. `GET /site/edition/current` — every item has an English `headline_en`, a `reason`, an external
     `url`, and a `source_name`; items from Hebrew/Arabic outlets show `source_lang` != `en` with a
     populated `headline_original`.
  4. `POST /reports/generate {"report_type":"headline_digest","lookback_hours":24}` → English
     markdown grouped by interest; `scripts/report_audit.py --report <id>` exits 0.
  5. `POST /share-links {"scope":"site"}` → open `/p/{token}` in a private browser session and get
     the same stories; `POST /share-links/{id}/revoke` → 410.
  6. `GET /site/feed.rss` validates as RSS 2.0 and every `<link>` points to an external domain.

## Working style
One commit per numbered step, conventional commits. Append a `## Reader product` section (≤25 lines)
to `CLAUDE.md`: translation is cached by content hash and scoped to edition/digest items only;
editions are immutable; `to_story_out` is the single serialization chokepoint and the place rights
are enforced; share tokens are 256-bit and revocable. Never weaken a gate to make it pass. Final
report: translation cache hit rate, per-language document counts in the current edition, LLM cost
of one edition build and one digest, and the digest's headline count vs. the context's headline count.
