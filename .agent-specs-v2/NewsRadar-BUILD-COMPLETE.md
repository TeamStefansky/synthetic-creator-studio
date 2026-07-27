# NewsRadar — מסמך בנייה מלא

**מערכת ניטור חדשות ואתר קריאה אישי — הכל, מאפס.**
גרסה: 2026-07-27 · כולל את מפת המקורות והמחירים נכון למועד זה.

---

## מה זה

שני מוצרים על תשתית אחת:

**א. מערכת ניטור לחדר החדשות.** מגדירים watchlist (מילות מפתח + ישויות), המערכת אוספת בעולם כולו,
מקבצת כתבות לאירועים, מזהה אזורים חמים וטרנדים, מזהה סיקור שלילי ממוקד-ישות, ומוציאה דוחות והתראות.

**ב. אתר חדשות אישי.** בוחרים מקורות (RSS + API), מגדירים תחומי עניין לפי מילות מפתח ומדינות,
והמערכת מייצרת אתר קריאה באנגלית — הכל מתורגם, עם תמונות וזהות המקור, מהדורה יציבה כל 30 דקות,
דוח כותרות יומי למייל, ולינקי שיתוף. בסגנון Google News, עם Full Coverage שמפלח את הסיפור לזוויות
ומשווה איך מדינות ושפות שונות מסקרות אותו.

---

## תוכן העניינים

| חלק | מה יש בו |
|---|---|
| 1 | ארכיטקטורה — שבע השכבות |
| 2 | מפת המקורות וה-API (מצב 2026) |
| 3 | המודל המשפטי — שלוש רמות זכויות |
| 4 | מודל עלויות |
| 5 | איך מריצים את סדרת הפרומפטים |
| 6 | `CLAUDE.md` — זיכרון הפרויקט |
| 7–15 | הפרומפטים P0–P8 |
| 16 | סיכונים ומלכודות |

---

# 1. ארכיטקטורה

```
[1] Ingestion  → [2] Normalize + Dedup → [3] Enrich (embeddings/NLP/LLM)
                                                   ↓
                                         [4] Event Clustering
                                                   ↓
                              [5] Signal Engine ────┬──→ [6] Alerts
                                                    ├──→ [7] Reports / Digest
                                                    └──→ [8] Editions → Reader Site
```

**1. Ingestion.** קונקטור לכל מקור, כולם כותבים לתור אחד. סכמה אחידה:
`{id, url, source, source_country, lang, published_at, title, body, author, engagement, media_type}`.

**2. Normalize + Dedup.** קריטי ולרוב מדלגים עליו. סיפור אחד מתפרסם ב-400 אתרים. SimHash למציאת
כפילויות-כמעט + canonical URL. בלי זה כל מדד במערכת שגוי.

**3. Enrichment.** embedding מולטי-לשוני, NER, גיאו-קידוד, קטגוריה, סנטימנט, ו-**stance ממוקד-ישות**.
כלל ברזל: לא שולחים כל כתבה ל-LLM חזק. מודלים זולים לשכבה הרחבה, מודל חזק רק על נציגי אשכולות.

**4. Event Clustering.** הליבה. אשכול אונליין אינקרמנטלי (centroid + time decay, חלון 72 שעות).
הפלט הוא לא "1,200 כתבות" אלא "37 אירועים, מתוכם 4 בצמיחה".

**5. Signal Engine.** כאן נולדים ה"אזורים החמים":
- **Velocity / Acceleration** — קצב פרסום ונגזרת שנייה מול baseline עונתי (z-score). זה מזהה טרנד
  לפני שהוא טרנד.
- **Source Diversity** — 50 כתבות מ-3 מקורות ≠ 50 כתבות מ-40 מקורות. השני הוא אירוע אמיתי.
  אנטרופיית שאנון משוקללת ב-tier.
- **Geo Heat** — צפיפות אירועים לפי H3 וקוד מדינה, ספייק ב-3σ מעל ממוצע 14 יום.
- **Negativity Index** — לא סנטימנט כללי. stance ממוקד-ישות × ביטחון × בולטות × משקל מקור.
- **Cross-platform Lift** — סיפור שקופץ מסושיאל למיינסטרים (או להפך) הוא הסיגנל החזק ביותר.

**6–8. פלטים.** התראות בזמן אמת, דוחות אנליסט מתוזמנים, ומהדורות בלתי-משתנות שמזינות את אתר הקריאה.

---

# 2. מפת המקורות וה-API — מצב 2026

## חדשות

| מקור | מה נותן | עלות |
|---|---|---|
| **GDELT 2.0** | ניטור שידור, דפוס וווב כמעט בכל מדינה, עדכון כל 15 דקות. תרגום מכונה של 65 שפות. 2,200+ רגשות ותמות (GCAM). BigQuery + DOC 2.0 API | **חינם** |
| **Perigon** | עד מיליון כתבות ביום, מפריד hard news / soft news / דעה, מזהה מיקום עד קו אורך-רוחב | $$ |
| **Event Registry** | מקבץ כתבות לאירועים במקור. מ-$3,000/שנה | $$ |
| **NewsCatcher** | 70,000+ מקורות, סנטימנט/NER/dedup מובנים. מ-$399/חודש ל-250k קריאות | $$ |
| **Webz.io** | כיסוי רב-לשוני גלובלי, סטנדרט לניטור ציות ארגוני | $$$ |
| **RSS ישיר** | 200–400 פידים של גופי חדשות מובילים. הכיסוי העברי הטוב ביותר | **חינם** |

**המלצה:** GDELT כרשת רחבה גלובלית + Perigon או Event Registry כשכבת עומק. שתי שכבות, לא אחת.

## סושיאל — כאן הכאב

| פלטפורמה | המצב האמיתי |
|---|---|
| **X** | מאז פברואר 2026 pay-per-use: ~$0.005 לקריאת פוסט, תקרה 2M/חודש (~$10,000), ומעליה Enterprise (~$42,000+/חודש). Free tier בוטל, Basic/Pro סגורים להרשמות חדשות. ארכיון מלא וסטרימינג — Enterprise בלבד. ספקי צד ג' זולים ב-90-99% אבל באפור משפטית |
| **Meta (FB/IG)** | **גופי תקשורת מסחריים חסומים** מגישה ל-Meta Content Library. הדרך היחידה — ספק מסחרי מורשה |
| **TikTok** | אין API מסחרי לחיפוש מילות מפתח. ה-Research API סגור לאקדמיה |
| **Reddit** | חינם ל-100 QPM לא-מסחרי; מסחרי $0.24/1,000 קריאות, מינימום $12,000/שנה + אישור ידני |
| **YouTube** | Data API v3, 10,000 יחידות קוואטה ליום — חינם ושמיש |
| **Telegram** | MTProto פתוח (Telethon). **קריטי לזירה הישראלית והאזורית**. חינם |
| **Bluesky** | API פתוח, חינם |

## שידור
GDELT TV API (ארה"ב, דרך Internet Archive) לגלובלי. בישראל — **יפעת** היא הספק היחיד עם כיסוי
שידור עברי אמיתי. אין תחליף טכני.

---

# 3. המודל המשפטי — קרא לפני P5

האתר מפרסם תוכן של אחרים. המודל נעול בשלוש רמות ב-`sources.content_rights`:

| רמה | מה נשמר ומוצג | מתי |
|---|---|---|
| `link_only` (**ברירת מחדל**) | כותרת מתורגמת + עד 300 תווים + תמונה מה-OG + לוגו + לינק | כל מקור חדש, **תמיד** |
| `extract_ok` | אותו דבר, עד 400 תווים | כשתנאי הפיד מתירים במפורש |
| `full_ok` | גוף מלא + תרגום מלא | רק סוכנויות מורשות, שותפים, או תוכן שלך |

שדרוג הוא פעולה ידנית שדורשת הנמקה כתובה — ה-API דוחה אותו בלעדיה. המערכת לעולם לא מסיקה רמה מהפיד.

**ההבדל בין Google News ל-MSN הוא בדיוק הקו הזה.** גוגל מציגה כותרת + סניפט + לינק ותו לא. MSN
הציגו כתבות מלאות **כי שילמו למו"לים על רישיון**. כשתגיע לנקודה שאתה רוצה גוף מלא — הדרך היא חוזה,
ואז מסמנים `full_ok` והמערכת כבר יודעת. התשתית מוכנה, היא פשוט לא נותנת לעשות את זה בטעות.

**"נראה כמו הכתבה המקורית"** ממומש דרך `<iframe>` שמציג את העמוד של המו"ל מהשרת של המו"ל — הוא
מגיש, הוא מקבל את הצפייה, אפס חשיפה. אתרים שחוסמים framing נופלים אלגנטית לכרטיס המתורגם.
**אין אופציה שלישית** — אין רינדור של גוף כתבה שה-API לא סיפק.

**עוד שלושה כללים שנאכפים בקוד:**
- תמונות ב-hotlink בלבד. אין הורדה, cache, resize או אחסון מחדש.
- תרגום של גוף מלא הוא יצירת נגזרת — מותר רק ב-`full_ok`. נאכף בשירות התרגום, לא בקריאה לו.
- כל payload עובר דרך `site/serializers.py::to_story_out`. זו נקודת החנק היחידה, וזה הקובץ
  היחיד שחייבים לקרוא ידנית.

---

# 4. מודל עלויות

**קבוע חודשי (MVP):**

| רכיב | עלות |
|---|---|
| GDELT + RSS + Telegram + YouTube | $0 |
| שרת (4 vCPU / 16GB / 200GB) | ~$60 |
| Postgres מנוהל | ~$50 |
| **סה"כ תשתית** | **~$110/חודש** |

**LLM — משתנה, וזה מה שקובע:**

הארכיטקטורה בנויה כך שהעלות לא מתפוצצת:

| שכבה | מודל | היקף |
|---|---|---|
| Embeddings | self-hosted e5 | כל מסמך — $0 |
| ישויות + סנטימנט | Haiku, באצ' של 10 | כל מסמך |
| Stance ממוקד-ישות | Haiku, באצ' של 5 | רק מסמכים שתפסו watchlist עם ישויות |
| תרגום | Haiku, באצ' של 12, cache לפי hash | רק פריטי מהדורה + דוח (~120/יום) |
| תקצירי אירועים | Sonnet | רק נציגי אשכולות |
| דוחות, זוויות, השוואה | Sonnet | פעם בדוח / פעם באירוע-שעה |

בהיקף של 5,000 מסמכים ביום זה מסתדר בסדר גודל של **$150–400/חודש** ב-LLM. **בלי המשמעת הזאת אותו
היקף עולה פי 20.** יש `LLM_DAILY_BUDGET_USD` שעוצר בחסד, ו-cost gates בבדיקות.

**בתשלום, כשמתרחבים:** Perigon/NewsCatcher $400–1,500/חודש · X דרך ספק $200–2,000/חודש ·
Enterprise של X $42,000+/חודש (כמעט תמיד לא מוצדק).

---

# 5. איך מריצים

```bash
# פעם אחת
mkdir newsradar && cd newsradar && git init
# להעתיק את חלק 6 (CLAUDE.md) לקובץ CLAUDE.md בשורש

# לכל שלב — סשן נקי של Claude Code
claude
> /plan            # חובה ב-P2, P3, P5, P6, P8
> [להדביק את הפרומפט של השלב]
```

| # | מה נבנה | תנאי כניסה |
|---|---|---|
| P0 | סקאפולד, סכמה מלאה, מיגרציות, health | ריפו ריק |
| P1 | קונקטורים, matcher, dedup | P0 ירוק |
| P2 | embeddings, ישויות, גיאו, stance, אשכול אירועים | P1 ירוק |
| P3 | סיגנלים, אזורים חמים, טרנדים, התראות, דוחות | P2 ירוק |
| P4 | דשבורד ניטור בעברית RTL | P3 ירוק |
| P5 | מקורות: באצ', גילוי פידים, רמות זכויות, מדינות | P4 ירוק |
| P6 | תרגום, מהדורות, דוח כותרות, שיתוף, פידי RSS | P5 ירוק |
| P7 | אתר הקריאה באנגלית + Sources + שיתוף | P6 ירוק |
| P8 | Full Coverage — זוויות והשוואה בין-לשונית | P7 ירוק |

**חמישה כללי ברזל:**

1. **סשן נפרד לכל שלב.** שני שלבים באותו סשן = קונטקסט מלוכלך והסוכן מתחיל "לתקן" קוד תקין.
2. **אל תעבור שלב לפני שה-Verification עבר.** ה-definition of done של N הוא תנאי הכניסה ל-N+1.
3. **אל תיתן לסוכן להחליש quality gate.** יש כאלה בכל שלב מ-P2: טוהר אשכולות ≥0.90, זיהוי ספייק
   ללא false positives, negativity ממוקד-ישות, אכיפת זכויות תוכן, שלמות דוח הכותרות, אטריביוציה
   בפרונט, ציטוט מקורות בהשוואה. הן נראות כמו טרחה טכנית והן בעצם ההגנה שלך.
4. **סקור ידנית חמישה קבצים** — שם נקבעות החלטות מוצר, לא החלטות קוד:
   `pipeline/stance.py` (P2) · `signals/scoring.py` + `weights.py` (P3) · `pipeline/normalize.py`
   (P5) · `site/serializers.py` (P6) · `coverage/comparison.py` (P8).
5. **לפני שמדביקים 150 אתרים — בדוק 10.** בפועל כ-60-70% מאתרי החדשות עדיין חושפים RSS; השאר
   מכוסים דרך GDELT/Perigon עם פילטר מדינה. לכן קיים טאב Global sources.

---

---

# 6. CLAUDE.md — זיכרון הפרויקט (להעתיק לשורש הריפו)

# CLAUDE.md — NewsRadar

## Project overview
NewsRadar is a global news & social intelligence platform for a newsroom. Editors define
watchlists (keywords + entities); the system continuously ingests news articles, social posts
and forum discussion worldwide, clusters them into **events**, scores them for heat and
negativity, and emits scheduled detailed reports plus real-time alerts.
Primary languages of monitored content: Hebrew, Arabic, English. UI is Hebrew (RTL).

## Stack (pinned — do not substitute)
- Python 3.12, `uv` for dependency management (`uv sync`, `uv run`)
- FastAPI 0.115+, Pydantic v2, SQLAlchemy 2.0 (async), Alembic
- PostgreSQL 16 + `pgvector` 0.7+ extension
- Redis 7 + Celery 5.4 (worker + beat) for queues and scheduling
- `sentence-transformers` with `intfloat/multilingual-e5-large` (1024-dim embeddings)
- Anthropic SDK (`anthropic`) — `claude-haiku-4-5-20251001` for per-document classification,
  `claude-sonnet-5` for event summaries and report generation
- Frontend: Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, MapLibre GL, Recharts
- Tests: pytest + pytest-asyncio + testcontainers-python; frontend: vitest
- Lint/format: ruff (lint + format), mypy strict on `src/newsradar/`; eslint + prettier in `web/`

## Commands
```bash
uv sync                              # install deps
docker compose up -d                 # postgres + redis
uv run alembic upgrade head          # migrations
uv run uvicorn newsradar.api.main:app --reload   # API on :8000
uv run celery -A newsradar.tasks.celery_app worker -l info
uv run celery -A newsradar.tasks.celery_app beat -l info
uv run pytest                        # full test suite
uv run ruff check . && uv run ruff format --check . && uv run mypy src/
cd web && npm run dev                # dashboard on :3000
```

## Architecture map
```
src/newsradar/
├── config.py           Settings (pydantic-settings), all secrets from env
├── db/                 models.py (SQLAlchemy), session.py, base.py
├── connectors/         One module per source. All subclass BaseConnector.
│                       base.py, gdelt.py, rss.py, telegram.py, youtube.py,
│                       perigon.py, registry.py
├── pipeline/           normalize.py, dedup.py, matcher.py, embed.py,
│                       enrich.py, cluster.py
├── signals/            velocity.py, diversity.py, negativity.py, geo.py, scoring.py
├── llm/                client.py (retry//rate-limit wrapper), schemas.py (Pydantic
│                       output contracts), prompts/ (*.md templates)
├── reports/            builder.py, renderer.py, delivery.py
├── tasks/              celery_app.py + one module per periodic job
└── api/                main.py, routers/, deps.py
web/                    Next.js dashboard
migrations/             Alembic — NEVER hand-edit applied migrations
tests/                  Mirrors src/ layout
```

## Data model — core entities
`sources` → `documents` → `document_enrichment` / `document_matches` / `stance_assessments`
`watchlists` → `watchlist_terms`, `watchlist_entities`
`events` ←→ `event_documents`, `event_metrics`, `alerts`
`report_schedules` → `reports`

A **document** is one raw item (article/post). An **event** is a cluster of documents about the
same real-world happening, scoped to a watchlist. Reports are generated over events, never over
raw documents.

## Conventions
- Async everywhere in I/O paths. Celery tasks are sync wrappers that call `asyncio.run()`.
- All external calls go through a connector or `llm/client.py` — never `httpx` inline in business logic.
- Every connector returns `list[RawDocument]` (Pydantic model in `connectors/base.py`). Connectors
  do not touch the DB.
- Timestamps: always timezone-aware UTC. Store as `TIMESTAMPTZ`.
- Language codes: ISO 639-1. Country codes: ISO 3166-1 alpha-2.
- LLM outputs are ALWAYS parsed into a Pydantic schema from `llm/schemas.py`. Never regex an LLM response.
- Errors: connectors raise `ConnectorError`; pipeline stages log and skip a bad document rather
  than failing a whole batch. One poison document must never stall a run.
- Commits: conventional commits (`feat:`, `fix:`, `chore:`, `test:`). One commit per phase.

## Hard rules
- NEVER send every ingested document to a frontier LLM. Cheap models + embeddings do the bulk;
  `claude-sonnet-5` runs only on event representatives and report generation. Cost discipline is a
  functional requirement, not a nice-to-have.
- NEVER hardcode API keys. All credentials from env, documented in `.env.example`.
- NEVER hand-edit files under `migrations/versions/` that have already been applied.
- Respect source licensing: store full text only where the provider's terms allow it. The
  `sources.allows_fulltext_storage` flag gates this — honor it in `pipeline/normalize.py`.
- Do not add new dependencies without listing them and their purpose in your report first.
- No abstraction until the second concrete use case. Do not build plugin systems, generic
  rule engines, or config DSLs unless a prompt explicitly asks for one.

## Domain notes the agent cannot infer
- **Sentiment ≠ negativity toward a target.** An article about a terror attack scores negative
  overall but may be favorable to the monitored entity. Negativity must always be *entity-targeted
  stance*, computed per `watchlist_entities` row.
- **Prominence matters.** A negative mention in the headline weighs ~10x a mention in paragraph 14.
  `document_enrichment.prominence` (0.0–1.0) captures this and multiplies into negativity scores.
- **Deduplication is load-bearing.** One wire story republishes across hundreds of outlets. Without
  near-duplicate collapse every metric in the system is wrong.
- **Source diversity beats volume.** 50 documents from 3 outlets is noise; 50 from 40 outlets is a
  real event. Never rank events by raw document count alone.


---

# 7. P0 — Scaffold & Data Model

# Task: Scaffold NewsRadar and build the complete data model

## Context
Greenfield project. Nothing exists yet. Read `CLAUDE.md` in the repo root before writing anything —
it pins the stack, conventions and hard rules for the whole project. This prompt covers Phase 0
(scaffold) and Phase 1 (schema). No ingestion, no NLP, no UI in this phase.

Domain: a newsroom monitoring tool. Editors define *watchlists* (a topic + its keywords + the
entities whose coverage they care about). The system ingests documents worldwide, clusters them
into events, scores heat and entity-targeted negativity, and produces scheduled reports.

ASSUMPTION: single-tenant deployment for one newsroom. No multi-org isolation in v1.
ASSUMPTION: Postgres and Redis run via `docker compose` locally; production hosting is out of scope.
ASSUMPTION: no user authentication in v1 (the dashboard runs behind the newsroom VPN).

## Objective
A developer can clone the repo, run `docker compose up -d && uv sync && uv run alembic upgrade head
&& uv run pytest`, and get a green test suite plus a fully migrated database containing every table
the rest of the system needs. `GET /health` returns `{"status":"ok","db":"ok","redis":"ok"}`.

## Requirements
1. Repo scaffold with `uv`-managed Python 3.12, ruff, mypy (strict on `src/newsradar/`), pytest.
2. `docker-compose.yml` with `postgres:16` (with `pgvector` — use `pgvector/pgvector:pg16`) and `redis:7`.
3. `src/newsradar/config.py`: pydantic-settings `Settings` reading every env var listed in `.env.example`.
4. Async SQLAlchemy 2.0 session factory in `src/newsradar/db/session.py` using `asyncpg`.
5. Complete schema in `src/newsradar/db/models.py` (spec below) + one Alembic migration that
   creates the `vector` extension and all tables/indexes.
6. FastAPI app in `src/newsradar/api/main.py` with a single `/health` route that actually pings
   Postgres and Redis.
7. Celery app in `src/newsradar/tasks/celery_app.py` with Redis broker + result backend, and one
   `ping` task, plus an empty beat schedule dict ready to be filled by later phases.
8. Seed script `scripts/seed.py` that inserts: ~40 `sources` rows (major global outlets + Israeli
   outlets, with country/lang/tier), and one demo watchlist with 5 terms and 2 entities.
9. Tests: schema smoke test (create all tables against a testcontainer Postgres, insert one row per
   table, assert FK and unique constraints fire), config test, `/health` test.

## Data model (implement exactly)

**sources** — `id` (uuid pk), `name`, `domain` (unique), `source_type` enum
(`news|social|forum|broadcast|blog|aggregator`), `platform` (nullable text: `x`,`telegram`,
`youtube`,`reddit`,...), `country_code` (char2, nullable), `lang` (varchar 8, nullable),
`tier` smallint 1–4 (1 = tier-1 international wire), `credibility_score` float 0–1 default 0.5,
`allows_fulltext_storage` bool default false, `active` bool default true, `meta` jsonb,
`created_at`, `updated_at`.

**watchlists** — `id`, `name` (unique), `description`, `lang_filter` text[] nullable,
`country_filter` char2[] nullable, `active` bool, `created_at`, `updated_at`.

**watchlist_terms** — `id`, `watchlist_id` fk cascade, `term` text, `term_type` enum
(`keyword|phrase|boolean|entity_alias`), `lang` varchar8 nullable, `is_exclusion` bool default false,
`weight` float default 1.0. Unique on (`watchlist_id`,`term`,`lang`).

**watchlist_entities** — `id`, `watchlist_id` fk cascade, `name`, `entity_type` enum
(`person|org|product|place|brand`), `aliases` text[], `is_primary` bool default false.
These are the targets for stance/negativity scoring.

**documents** — `id`, `source_id` fk, `external_id` text nullable, `url` text, `canonical_url` text,
`url_hash` char64 (sha256 of canonical_url) **unique**, `simhash` bigint (indexed), `title` text,
`body` text nullable, `summary` text nullable, `lang` varchar8, `published_at` timestamptz (indexed),
`fetched_at` timestamptz, `author` text nullable, `media_type` enum (`article|post|comment|video|
broadcast_transcript`), `engagement` jsonb (likes/shares/comments/views — nullable per platform),
`raw` jsonb, `dedup_of` uuid fk self-ref nullable (points at the canonical document of a
near-duplicate cluster). Composite index on (`published_at desc`, `source_id`).

**document_matches** — `id`, `document_id` fk cascade, `watchlist_id` fk cascade, `matched_terms`
text[], `match_score` float. Unique on (`document_id`,`watchlist_id`).

**document_enrichment** — `document_id` pk fk cascade, `embedding` `vector(1024)`, `entities` jsonb
(list of `{text,type,offset,confidence}`), `topics` text[], `geo` jsonb
(`{country_code, admin1, lat, lon, confidence}`), `sentiment_overall` float −1..1,
`prominence` float 0..1, `is_opinion` bool, `enriched_at`, `model_version` text.
HNSW index on `embedding` with `vector_cosine_ops`.

**stance_assessments** — `id`, `document_id` fk cascade, `entity_id` fk `watchlist_entities`,
`stance` smallint (−2..+2, CHECK constraint), `confidence` float, `evidence_span` text,
`framing` text nullable, `model` text, `created_at`. Unique on (`document_id`,`entity_id`).

**events** — `id`, `watchlist_id` fk cascade, `title` text, `summary` text nullable,
`centroid` `vector(1024)`, `status` enum (`emerging|active|decaying|closed`) default `emerging`,
`first_seen_at`, `last_seen_at`, `doc_count` int default 0, `source_count` int default 0,
`country_codes` char2[], `geo_centroid` jsonb, `heat_score` float default 0,
`negativity_score` float default 0, `created_at`, `updated_at`.
Index on (`watchlist_id`,`status`,`last_seen_at desc`). HNSW index on `centroid`.

**event_documents** — `event_id` fk cascade, `document_id` fk cascade, `similarity` float,
`added_at`. Composite pk (`event_id`,`document_id`).

**event_metrics** — `id`, `event_id` fk cascade, `bucket_at` timestamptz (hourly bucket),
`doc_count` int, `velocity` float, `acceleration` float, `source_diversity` float,
`negativity_index` float, `cross_platform_lift` float, `heat_score` float.
Unique on (`event_id`,`bucket_at`).

**alerts** — `id`, `event_id` fk cascade, `rule_name` text, `severity` enum (`info|warning|critical`),
`fired_at`, `payload` jsonb, `delivered_at` nullable, `delivery_error` text nullable.

**report_schedules** — `id`, `watchlist_id` fk cascade, `name`, `cron` text, `timezone` text default
`Asia/Jerusalem`, `sections` text[] (e.g. `{overview,hot_events,trends,negative_coverage,geo,sources}`),
`recipients` jsonb, `format` enum (`markdown|html|pdf`), `lookback_hours` int default 24,
`active` bool, `last_run_at` nullable.

**reports** — `id`, `watchlist_id` fk, `schedule_id` fk nullable, `period_start`, `period_end`,
`generated_at`, `markdown` text, `html` text nullable, `artifact_path` text nullable,
`model` text, `input_tokens` int, `output_tokens` int, `event_ids` uuid[].

## Technical decisions (follow these — do not re-litigate)
- SQLAlchemy 2.0 declarative with `Mapped[...]` / `mapped_column`. Type annotations everywhere.
- Native Postgres enums via `sqlalchemy.Enum(..., name="...")`, created in the migration.
- `pgvector.sqlalchemy.Vector(1024)` for embedding columns.
- UUIDv7-style time-ordered ids are unnecessary — use `uuid4` server-side defaults (`gen_random_uuid()`).
- One Alembic migration for this whole phase, named `0001_initial_schema`.
- `.env.example` documents every variable: `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`,
  `PERIGON_API_KEY`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `YOUTUBE_API_KEY`, `SMTP_*`,
  `SLACK_WEBHOOK_URL`, `EMBEDDING_MODEL`, `LOG_LEVEL`.
- Structured logging with `structlog`, JSON output in production, console in dev.

## Constraints & non-goals
- Do NOT implement any connector, NLP, clustering, report, or UI code in this phase. Empty package
  `__init__.py` files with a module docstring are correct for `connectors/`, `pipeline/`, `signals/`,
  `reports/`, `llm/`.
- Do NOT add authentication, Docker production images, Kubernetes manifests, or CI config.
- Do NOT add an ORM repository/unit-of-work abstraction layer. Query with sessions directly.
- Do NOT create the `web/` frontend yet.

## Implementation plan
0. Scaffold: `pyproject.toml`, `uv.lock`, ruff/mypy/pytest config, `docker-compose.yml`,
   `.env.example`, package skeleton, `structlog` setup. Verify: `uv run pytest` passes (one dummy
   test), `uv run ruff check .` clean.
1. `config.py` + `db/session.py` + `/health` endpoint + Celery app with `ping` task.
   Verify: `curl localhost:8000/health` returns all-ok; `uv run celery -A ... inspect ping` works.
2. `db/models.py` — full schema above. Verify: `uv run mypy src/` clean.
3. Alembic init + `0001_initial_schema`. Verify: `uv run alembic upgrade head` then
   `uv run alembic downgrade base` then `upgrade head` again, all clean.
4. `scripts/seed.py` + tests. Verify: `uv run python scripts/seed.py` is idempotent (running twice
   does not error or duplicate).

## Verification (definition of done)
- `uv run pytest` — all green, including a schema test that inserts one row into every table and
  asserts the `url_hash` unique constraint and the `stance` CHECK constraint both raise.
- `uv run ruff check . && uv run ruff format --check . && uv run mypy src/` — all clean.
- `uv run alembic upgrade head` from an empty database succeeds; `\d+ documents` shows the expected
  indexes; `SELECT * FROM pg_extension WHERE extname='vector'` returns a row.
- `uv run python scripts/seed.py && uv run python scripts/seed.py` — idempotent, exits 0 both times.
- End-to-end scenario: `GET /health` → `{"status":"ok","db":"ok","redis":"ok"}`.

## Working style
One commit per numbered phase, conventional commit messages. Run ruff + mypy before declaring done.
In your final report list: files created, every table with its row count after seeding, and anything
in the spec you did not implement and why.


---

# 8. P1 — Ingestion & Dedup

# Task: Build the ingestion layer — connectors, watchlist matching, deduplication

## Context
Read `CLAUDE.md` first. Phase P0 delivered: the full database schema (migrated), `config.py`,
async session factory, Celery app with Redis, `/health`, and a seed script. All packages under
`src/newsradar/` exist but `connectors/` and `pipeline/` are empty.

This phase makes documents flow into the database from real sources, matched against watchlists and
deduplicated. No NLP beyond language detection — embeddings and clustering come in P2.

Source landscape as of 2026 — these are hard facts, do not attempt to work around them:
- **GDELT 2.0 DOC API** is free, updates every 15 minutes, machine-translates 65 languages into
  English, and returns article metadata + URLs (not full text). Primary global wide net.
- **RSS** from named outlets is free and gives the highest-quality Israeli/Hebrew coverage.
- **Telegram** public channels via MTProto (Telethon) — critical for the Israeli/Middle East beat.
- **YouTube Data API v3** — 10,000 quota units/day, free.
- **Perigon** — paid REST API, rich metadata (sentiment, entities, lat/lon, hard-vs-soft-news
  classification). Implement behind a feature flag; it is optional for local dev.
- **X/Twitter, TikTok, Reddit, Meta are deliberately OUT OF SCOPE for this phase.** X is
  pay-per-use with a 2M read cap, TikTok has no commercial search API, Reddit commercial access
  requires a negotiated contract, and Meta's Content Library bans commercial news outlets. They
  will be added later behind a paid-vendor adapter. Do not write speculative code for them.

## Objective
Running `uv run python -m newsradar.tasks.ingest_once --watchlist demo` pulls fresh documents from
every enabled connector, stores them deduplicated, and links each to the watchlists it matched.
Running it twice in a row adds zero duplicate rows. The Celery beat schedule runs the same pipeline
automatically on a per-connector cadence.

## Requirements
1. `connectors/base.py`: `RawDocument` Pydantic model and `BaseConnector` ABC with
   `async def fetch(self, query: WatchlistQuery, since: datetime) -> AsyncIterator[RawDocument]`,
   plus `name`, `source_type`, `default_interval_seconds`, and a `health_check()`.
2. Connectors implemented: `gdelt.py`, `rss.py`, `telegram.py`, `youtube.py`, `perigon.py`.
   `registry.py` exposes `get_enabled_connectors(settings) -> list[BaseConnector]` — a connector is
   enabled only if its required env vars are present.
3. `pipeline/matcher.py`: compiles a watchlist's terms into a matcher supporting keywords, exact
   phrases, boolean expressions (`AND`/`OR`/`NOT`, parentheses, quoted phrases), exclusion terms,
   and per-language term sets. Returns `(matched: bool, matched_terms: list[str], score: float)`.
   Score = sum of matched term weights, normalized. Must be correct for Hebrew and Arabic text —
   use Unicode word boundaries, not `\b` with ASCII assumptions.
4. `pipeline/normalize.py`: canonical URL (strip UTM and known tracking params, resolve
   `amp`/`m.` variants, lowercase host, drop fragment), `url_hash` (sha256 hex of canonical URL),
   language detection, HTML→text with `trafilatura`, `published_at` normalization to UTC.
   Full body text is stored ONLY when `sources.allows_fulltext_storage` is true; otherwise store
   title + a ≤400-char extract in `summary` and leave `body` NULL.
5. `pipeline/dedup.py`: 64-bit SimHash over the normalized title+first-500-chars. Two documents are
   near-duplicates if Hamming distance ≤ 3 AND `published_at` within 72 hours. The earliest
   document in a duplicate cluster is canonical; later ones get `dedup_of` set and are excluded
   from all downstream metrics. Exact-URL duplicates are rejected at insert via the `url_hash`
   unique constraint (upsert with `ON CONFLICT DO NOTHING`).
6. `tasks/ingest.py`: Celery tasks `ingest_connector(connector_name, watchlist_id)` and
   `ingest_all()`. Beat schedule: GDELT every 15 min, RSS every 10 min, Telegram every 5 min,
   YouTube hourly, Perigon every 15 min.
7. A CLI entrypoint `python -m newsradar.tasks.ingest_once --watchlist <name> [--connector X]
   [--since ISO8601]` that runs the same code path synchronously for debugging.
8. Rate limiting and resilience: per-connector token-bucket limiter, exponential backoff with
   jitter on 429/5xx (`tenacity`), per-connector circuit breaker that opens after 5 consecutive
   failures and logs a `connector.circuit_open` event. A failing connector must never abort a run
   of the others.
9. Ingestion run bookkeeping: log per run — connector, watchlist, fetched count, inserted count,
   duplicate count, error count, duration. Persist to a new `ingestion_runs` table (add an Alembic
   migration `0002_ingestion_runs`).

## Technical decisions (follow these — do not re-litigate)
- HTTP: `httpx.AsyncClient` with a shared, connector-scoped client and a 30s timeout. Set a
  descriptive `User-Agent` including a contact URL.
- RSS: `feedparser` for parsing, `trafilatura` for full-text extraction when permitted.
  The feed list lives in `config/feeds.yaml` (create it with ~120 entries: international wires,
  major English/Arabic/Hebrew outlets, tech and regional press), each entry
  `{url, source_domain, country, lang, tier}`.
- GDELT: use the DOC 2.0 API (`https://api.gdeltproject.org/api/v2/doc/doc`) with
  `format=json`, `mode=artlist`, `maxrecords=250`, and `timespan`/`startdatetime` for windowing.
  Translate the watchlist boolean expression into GDELT query syntax in `gdelt.py`, and cap at
  the API's documented limits — paginate by narrowing the time window, not by an offset param.
- Telegram: Telethon with a string session stored in `TELEGRAM_SESSION`. Channels list in
  `config/telegram_channels.yaml`. Read-only; never send messages or join private channels.
- YouTube: `search.list` + `videos.list` batching; budget-aware — stop when the daily quota
  estimate exceeds `YOUTUBE_DAILY_QUOTA_BUDGET` (default 8000 units).
- Perigon: guarded by `PERIGON_API_KEY`; map its native sentiment/entities/lat-lon straight into
  `documents.raw` for P2 to consume rather than discarding them.
- Inserts: batch upserts of 200 documents per statement using
  `insert(...).on_conflict_do_nothing(index_elements=["url_hash"])`.
- SimHash: implement it in `pipeline/dedup.py` (~40 lines). Do not add a dependency for it.

## Constraints & non-goals
- No embeddings, no entity extraction, no clustering, no LLM calls in this phase.
- No connectors for X, TikTok, Reddit, Facebook, Instagram.
- No web UI, no API routes beyond a `GET /connectors/status` that reports each connector's
  enabled/healthy state and last successful run.
- Do not scrape any site that is not in `feeds.yaml`. No generic web crawler.
- Do not modify `db/models.py` except to add `IngestionRun`.

## Implementation plan
1. `connectors/base.py` + `registry.py` + a `FakeConnector` used by tests. Verify: `uv run pytest
   tests/connectors/test_base.py` green.
2. `pipeline/normalize.py` + `pipeline/matcher.py` with a thorough test suite. Verify: matcher
   tests cover Hebrew phrase matching, Arabic keyword matching, boolean `A AND (B OR C) NOT D`,
   and exclusion terms; URL canonicalization tests cover UTM stripping and AMP variants.
3. `pipeline/dedup.py` + tests using two real near-duplicate wire stories fixed in
   `tests/fixtures/`. Verify: distance ≤3 detected, distinct stories not merged.
4. `connectors/rss.py` + `config/feeds.yaml` + `gdelt.py`. Verify: `python -m
   newsradar.tasks.ingest_once --watchlist demo --connector rss` inserts >0 documents; running it
   again inserts 0.
5. `connectors/telegram.py`, `youtube.py`, `perigon.py` — each skipped gracefully when creds absent.
6. `tasks/ingest.py` + beat schedule + `ingestion_runs` table + migration `0002_ingestion_runs`
   + `GET /connectors/status`.

## Verification (definition of done)
- `uv run pytest` — all green, including all P0 tests still passing. New tests must cover: matcher
  (≥12 cases incl. RTL languages), URL canonicalization, SimHash near-duplicate detection,
  connector circuit breaker, and batch upsert idempotency.
- `uv run ruff check . && uv run mypy src/` — clean.
- Live scenario (requires network): `uv run python -m newsradar.tasks.ingest_once --watchlist demo`
  completes in <5 minutes, and `SELECT connector, fetched, inserted, duplicates FROM ingestion_runs
  ORDER BY started_at DESC LIMIT 10` shows non-zero `inserted` for at least GDELT and RSS.
- Idempotency: run the same command twice; the second run reports `inserted = 0` and
  `duplicates > 0`.
- Offline scenario: with `DATABASE_URL` pointed at a testcontainer and all connectors replaced by
  `FakeConnector`, the full pipeline runs and produces the expected `document_matches` rows.
- `GET /connectors/status` lists every connector with `enabled`, `healthy`, `last_run_at`.

## Working style
One commit per numbered step, conventional commits. Do not add a dependency without listing it and
its justification in your report. Final report must include: per-connector document counts from a
real run, the duplicate-collapse rate observed, and any source you could not reach and why.


---

# 9. P2 — Enrichment & Clustering

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


---

# 10. P3 — Signals, Alerts & Reports

# Task: Build the signal engine, alerting, and scheduled report generation

## Context
Read `CLAUDE.md` first. P0 delivered the schema, P1 ingestion + dedup, P2 enrichment
(`document_enrichment`, `stance_assessments`) and event clustering (`events`, `event_documents`)
with LLM-written event titles and summaries. `signals/` and `reports/` are still empty.
`event_metrics`, `alerts`, `report_schedules` and `reports` tables exist and are empty.

This phase produces the actual product output an editor consumes: a situational picture (what is
hot, where, and how fast it is moving), negative-coverage tracking, and a scheduled detailed report.

## Objective
An editor configures a report schedule ("every day at 07:00, last 24h, sections: overview, hot
events, trends, negative coverage, geo") and receives a Hebrew report by email and Slack containing:
a ranked list of events with heat scores and trajectory, emerging trends flagged before they peak,
every negative article about the watched entities with evidence, and a geographic hot-zone
breakdown. Separately, a critical alert fires within 10 minutes of an event crossing its threshold.

## Requirements

### Signal engine (`signals/`)
1. `velocity.py` — hourly bucketing per event:
   - `velocity` = documents in the last hour.
   - `acceleration` = z-score of the current hour's count against the event's own trailing 24h mean
     and stdev (Welford, min 6 buckets before a z-score is emitted; before that, `NULL`).
   - `baseline.py` — a per-watchlist seasonal baseline (mean documents per hour-of-week over the
     trailing 4 weeks) so "quiet Saturday" does not read as a spike.
2. `diversity.py` — `source_diversity` = normalized Shannon entropy over the distribution of the
   event's documents across distinct `source_id`, weighted by `sources.tier` (tier-1 counts 2.0,
   tier-2 1.5, tier-3 1.0, tier-4 0.5). Range 0–1.
3. `negativity.py` — `negativity_index` for an event, per entity and aggregate:
   `Σ over documents of (−stance/2) × confidence × prominence × tier_weight` divided by
   `Σ (confidence × prominence × tier_weight)`, clamped to 0–1, computed only over documents with
   `stance < 0`. Also emit `negative_doc_count` and `negative_reach_share` (share of weighted
   coverage that is negative). Documents with `is_opinion = true` are counted separately and
   reported in their own bucket — never blended into the main figure.
4. `geo.py` — hot zones: aggregate documents by `country_code` and by H3 hex (resolution 4) using
   `document_enrichment.geo`. A zone is "hot" when its document count in the last 6h exceeds
   3σ over its trailing 14-day mean. Output `{h3, country_code, lat, lon, doc_count, z, top_event_ids}`.
5. `scoring.py` — composite `heat_score` 0–100:
   `heat = 100 × sigmoid(0.35·norm(acceleration) + 0.25·norm(source_diversity) + 0.20·norm(velocity)
   + 0.10·norm(cross_platform_lift) + 0.10·norm(tier1_share))`.
   `cross_platform_lift` = 1 when an event has documents from ≥2 distinct `source_type` values
   within 6 hours of each other, scaled by how quickly it crossed over. All weights live in
   `signals/weights.py` as a single documented dict — one place to tune.
6. `trends.py` — a **trend** is distinct from an event: a term or entity whose share of watchlist
   documents in the current window is ≥2× its trailing 7-day share, with ≥8 documents and ≥4
   distinct sources. Emit `{term, current_share, baseline_share, lift, doc_count, source_count,
   representative_event_ids, first_detected_at}`. Persist to a new `trends` table
   (migration `0004_trends`).

### Alerting
7. `alerts` rules engine — a small, explicit set (no DSL, no config language):
   - `heat_spike`: heat_score crosses 70 → `warning`; crosses 85 → `critical`.
   - `negative_surge`: `negative_doc_count` for a primary entity ≥5 in 3h AND
     `negativity_index ≥ 0.6` → `critical`.
   - `tier1_pickup`: an event that had no tier-1 source acquires one → `warning`.
   - `new_trend`: a new row in `trends` with `lift ≥ 3` → `info`.
   Each rule has a per-event cooldown (default 6h) to prevent alert storms. Rules live in
   `signals/rules.py` as plain functions returning `Alert | None`.
8. Delivery in `reports/delivery.py`: Slack webhook and SMTP email. Delivery failures are retried
   3× with backoff and then recorded in `alerts.delivery_error` — a failed delivery never crashes
   the pipeline.

### Reports
9. `reports/builder.py` — assembles a `ReportContext` (a Pydantic model) for a watchlist and time
   window WITHOUT any LLM involvement: top events by heat with trajectory arrows, new events since
   last report, trends, negative coverage grouped by entity with evidence spans and links, geo hot
   zones, source breakdown, volume vs. previous period, and the noise stats (documents ingested,
   duplicates collapsed).
10. `reports/renderer.py` — one `claude-sonnet-5` call takes the `ReportContext` (as compact JSON,
    NOT raw article text) and writes the report in **Hebrew** as Markdown. Prompt template in
    `llm/prompts/report.md`. Requirements the prompt must enforce: every factual claim traceable to
    a supplied event/document id; no invented numbers; an executive summary of ≤120 words at the
    top; explicit "what changed since the last report" section; and an explicit statement when a
    section has no data rather than padding. Sections rendered are driven by
    `report_schedules.sections`.
11. HTML rendering with Jinja2 + a clean RTL-aware template; PDF via `weasyprint`. Store markdown,
    html and artifact path on the `reports` row.
12. `tasks/report.py` — Celery beat reads `report_schedules`, evaluates crons in the schedule's
    timezone, generates, renders, delivers, and stamps `last_run_at`. A missed window (worker
    downtime) generates once on recovery, not N times.
13. API routes in `api/routers/`: `GET /watchlists`, `GET /watchlists/{id}/events` (filter by
    status/min heat/time range, sorted by heat), `GET /events/{id}` (with documents and stance),
    `GET /watchlists/{id}/trends`, `GET /watchlists/{id}/geo`, `GET /reports`, `GET /reports/{id}`,
    `POST /reports/generate` (ad-hoc, body: watchlist_id, lookback_hours, sections),
    `GET/POST/PATCH /report-schedules`, `GET /alerts`. All responses Pydantic-typed, paginated
    with limit/offset.

## Technical decisions (follow these — do not re-litigate)
- All metric computation is SQL-first (window functions, `generate_series` for empty buckets),
  with Python only for the final scoring arithmetic. Do not pull raw documents into Python to count them.
- `event_metrics` is written once per event per hourly bucket by a Celery task every 10 minutes
  (upsert on the unique key). Never compute metrics on read.
- Report generation is a single Sonnet call over structured context. Never feed raw article bodies
  to the report model — this is both a cost and a hallucination control.
- Timezone: all scheduling in `Asia/Jerusalem` by default; all storage in UTC.
- Sigmoid, z-score and normalization helpers live in `signals/math.py` with unit tests. No numpy
  gymnastics inline.

## Constraints & non-goals
- No frontend — that is P4.
- No user accounts, permissions, or per-user report preferences.
- No A/B testing of scoring weights, no ML-learned ranking. Weights are hand-set constants.
- Do not add a rules DSL, a workflow engine, or a plugin architecture for alerts.
- Do not modify P1/P2 pipeline code except to append the metrics task to the existing chain.

## Implementation plan
1. `signals/math.py` + `velocity.py` + `baseline.py` + `diversity.py` + tests against a synthetic
   event timeline fixture with a known spike. Verify: the spike hour yields z ≥ 3, quiet hours ≤ 1.
2. `negativity.py` + tests, including the case where an event is overall-negative in tone but the
   monitored entity's stance is positive — `negativity_index` must stay low.
3. `geo.py` + `scoring.py` + `weights.py` + tests.
4. `trends.py` + `trends` table + migration `0004_trends` + tests.
5. `signals/rules.py` + `reports/delivery.py` + cooldown logic + tests (mocked Slack/SMTP).
6. `reports/builder.py` + `ReportContext` schema + tests asserting the context is complete and
   contains zero raw article bodies.
7. `reports/renderer.py` + `llm/prompts/report.md` + Jinja2 HTML + PDF.
8. `tasks/report.py`, beat wiring, missed-window handling.
9. API routers + OpenAPI docs.

## Verification (definition of done)
- `uv run pytest` — all green, all P0–P2 tests still passing.
- `uv run ruff check . && uv run mypy src/` — clean.
- Metric correctness gate: `tests/signals/test_spike_detection.py` on a synthetic 14-day timeline
  with one injected 5× spike detects exactly one spike hour, zero false positives. Do not weaken it.
- Negativity gate: `tests/signals/test_negativity_target.py` — the disaster-article-favorable-entity
  fixture yields `negativity_index < 0.2`.
- End-to-end scenario: `curl -X POST localhost:8000/reports/generate -d '{"watchlist_id":"<demo>",
  "lookback_hours":24,"sections":["overview","hot_events","trends","negative_coverage","geo"]}'`
  returns a report id; `GET /reports/{id}` returns Hebrew Markdown in which every event mentioned
  exists in `event_ids`, and the PDF renders RTL correctly.
- Alert scenario: `uv run python scripts/simulate_spike.py --watchlist demo` injects documents to
  force a heat spike; within one metrics cycle an `alerts` row of severity `critical` exists and a
  Slack payload was dispatched (assert against a local webhook catcher).
- Cooldown scenario: running `simulate_spike.py` twice within an hour produces exactly one alert.
- Hallucination check: `uv run python scripts/report_audit.py --report <id>` verifies every numeric
  figure in the report markdown appears in the source `ReportContext`. It must exit 0.

## Working style
One commit per numbered step, conventional commits. Never weaken a quality gate to make it pass —
if a gate fails, fix the algorithm and say so. Final report must include: the heat scores of the top
5 events from a real run, the alert rules that fired, the Sonnet token cost of one full report, and
any metric you approximated differently from this spec and why.


---

# 11. P4 — Monitoring Dashboard

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


---

# 12. P5 — Sources & Targeting

# Task: Build the source layer — batch RSS onboarding, API sources, and keyword + country targeting

## Context
Read `CLAUDE.md` first. NewsRadar currently works as an internal monitoring system: P0 schema,
P1 ingestion (GDELT/RSS/Telegram/YouTube/Perigon → deduplicated `documents`), P2 enrichment
(embeddings, entities, geo, entity-targeted stance) and event clustering, P3 signals/alerts/analyst
reports, P4 the Hebrew analyst dashboard.

This phase and the two that follow add a **second product**: a personal, English-language news site
assembled from sources the user chooses, filtered by their keywords and countries. The analyst
monitoring product is unchanged and its tests are the regression suite.

This phase is the source layer only: getting the user's chosen sources into the system at scale,
and targeting documents by keyword **and** country. Translation, editions, digests and the site UI
come in P6 and P7.

ASSUMPTION: single user/profile. No accounts, no per-user isolation.
ASSUMPTION: the user pastes ordinary news-site URLs, not feed URLs — feed discovery is the system's
job, and it must succeed on messy input (missing scheme, trailing paths, `www` variants, duplicates).

## Objective
The user pastes 150 news-site URLs into one textarea, submits once, and within a couple of minutes
has working RSS subscriptions for every site that exposes a feed, with a per-line report of what
succeeded, what was already subscribed, and what had no discoverable feed. They define an interest
as `{keywords, countries}` and the system routes matching documents to it, correctly distinguishing
"published by an outlet in France" from "a story about France".

## Requirements

### Source rights (do this first — everything else depends on it)
1. Add `sources.content_rights` enum (`link_only | extract_ok | full_ok`), **default `link_only`**,
   replacing the boolean `allows_fulltext_storage`. Migration must map existing
   `true → full_ok`, `false → link_only`. Keep a `rights_note` text column for why a source was
   upgraded (e.g. "licensed wire", "own property", "publisher permission email 2026-03-11").
   - `link_only`: store title + up to 300 chars of extract. `documents.body` stays NULL.
   - `extract_ok`: store title + up to 400 chars of extract. `body` stays NULL.
   - `full_ok`: full body may be stored.
   Enforce in `pipeline/normalize.py`. A newly discovered source is ALWAYS `link_only`; upgrading is
   a deliberate manual action through the API, never automatic and never inferred from the feed.
2. Capture presentation metadata during ingestion so P7 can render article-grade cards, into a new
   `document_media` table: `document_id` pk fk, `image_url`, `image_width`, `image_height`,
   `image_alt`, `og_title`, `og_description`, `og_site_name`, `favicon_url`, `byline`,
   `frameable` bool nullable, `fetched_at`.
   - Read `media:content` / `media:thumbnail` / `enclosure` from RSS first.
   - Only if absent, fetch the article URL's `<head>` (HEAD-then-ranged-GET, max 64KB) for OG tags.
   - `frameable`: from the same fetch, `false` if `X-Frame-Options` is set or the CSP contains
     `frame-ancestors` excluding us; `true` if neither; NULL if not determined. Cache per domain in
     a `domain_frameability` table (`domain` pk, `frameable`, `checked_at`) and re-check monthly.
   - **Store the image URL only. Never download, cache, resize, or re-host images.** Hotlinking with
     attribution is the legally safe posture here.

### Batch source onboarding
3. `feeds/discovery.py`: `discover_feeds(url) -> list[DiscoveredFeed]`. Normalize input first
   (add scheme if missing, strip paths/query, try `www` and apex). Then: `<link rel="alternate">`
   in `<head>`, then well-known paths (`/feed`, `/rss`, `/rss.xml`, `/feed.xml`, `/atom.xml`,
   `/index.xml`, `/feeds/posts/default`, `/?feed=rss2`), then any same-host `<a>` whose href
   matches `/(rss|feed|atom)/i`. Validate each candidate by parsing it and requiring ≥1 item.
   Return `{feed_url, title, site_title, item_count, last_published_at, detected_lang,
   detected_country}`. Never crawl beyond the given host; max 10 HTTP requests per site.
4. `feeds/opml.py`: OPML 2.0 import and export, folder names preserved as tags.
5. New table `feed_subscriptions` (migration `0005_sources`): `id`, `source_id` fk, `feed_url`
   unique, `title`, `tags` text[], `country_code` char2 nullable, `lang` varchar8 nullable,
   `poll_interval_seconds` default 600, `active` bool, `last_polled_at`, `last_ok_at`,
   `consecutive_failures` default 0, `etag`, `last_modified`, `created_at`.
   Creating a subscription creates or reuses a `sources` row matched on registrable domain
   (use `tldextract` so `bbc.co.uk` and `www.bbc.co.uk` collapse correctly).
6. Batch jobs — new table `source_import_jobs` (`id`, `status` enum
   `pending|running|done|failed`, `total`, `processed`, `created_at`, `finished_at`) and
   `source_import_results` (`id`, `job_id` fk cascade, `input_line`, `normalized_url`,
   `status` enum `added|duplicate|no_feed|invalid|error`, `feed_url` nullable, `title` nullable,
   `error` nullable).
   `POST /sources/batch` accepts up to 500 lines (newline, comma, or OPML file) and returns a job
   id immediately; a Celery task runs discovery with concurrency 8 and a per-site 15s timeout.
   `GET /sources/batch/{job_id}` returns progress plus every per-line result. A single bad line
   never fails the job.
7. Extend `connectors/rss.py` to poll `feed_subscriptions` alongside `config/feeds.yaml`, using
   stored `etag` / `If-Modified-Since` and persisting the response values. `consecutive_failures
   >= 10` auto-deactivates the subscription and records the reason.

### API-backed sources
8. New table `api_sources`: `id`, `provider` enum (`gdelt|perigon`), `name`, `enabled` bool,
   `country_filter` char2[], `lang_filter` text[], `extra_params` jsonb, `created_at`.
   These let the user pull from global providers scoped to chosen countries, without subscribing to
   individual outlets. `connectors/gdelt.py` and `perigon.py` read their query scope from these rows
   in addition to the watchlist terms. Perigon stays behind `PERIGON_API_KEY`; GDELT needs no key.

### Keyword + country targeting
9. Add `watchlists.kind` enum (`monitoring | interest`), default `monitoring`. An **interest** is a
   `watchlists` row with `kind='interest'`. Reuse `watchlist_terms` for keywords. Do NOT build a
   parallel model.
10. Add to `watchlists`: `source_country_filter` char2[] nullable, `subject_country_filter` char2[]
    nullable, `country_match_mode` enum (`source | subject | either`) default `either`.
    - **source country** = `sources.country_code` (where the outlet is based).
    - **subject country** = `document_enrichment.geo.country_code` (what the story is about).
    These are different questions and the user must be able to ask either. Document this distinction
    in the API schema descriptions — it is the single most confusing part of the product.
11. Add `watchlists.description_embedding vector(1024)` and `min_semantic_similarity` float default
    0.78. On create/update of an interest's description, embed `"query: " + description` with the
    existing `multilingual-e5-large` model.
12. `pipeline/matcher.py` gains hybrid matching **for `kind='interest'` only**: a document matches if
    the keyword/boolean matcher fires OR cosine similarity to `description_embedding` ≥ threshold;
    then the country filter is applied per `country_match_mode`. Record the path in
    `document_matches.matched_terms` (sentinel `__semantic__`) and reflect it in `match_score`
    (keyword hits outrank semantic-only). **Matching for `kind='monitoring'` must be byte-for-byte
    unchanged** — that is a gated regression test.

### API
13. `api/routers/sources.py`: `GET/POST/PATCH/DELETE /sources` (rights management —
    `PATCH /sources/{id}/rights` requires a `rights_note` in the body, and rejects an upgrade to
    `full_ok` without one), `GET /feeds`, `POST /feeds`, `PATCH /feeds/{id}`, `DELETE /feeds/{id}`,
    `POST /feeds/discover`, `POST /sources/batch`, `GET /sources/batch/{job_id}`,
    `POST /feeds/import-opml`, `GET /feeds/export-opml`, `GET /feeds/health`,
    `GET/POST/PATCH/DELETE /api-sources`.
14. `api/routers/interests.py`: `GET/POST/PATCH/DELETE /interests` (POST body: `{name, description,
    keywords[], source_countries[], subject_countries[], country_match_mode, lang_filter[]}`),
    plus `GET /interests/{id}/preview?limit=10` returning the most recent matching documents so the
    UI can calibrate the threshold live.

## Technical decisions (follow these — do not re-litigate)
- `tldextract` for domain normalization. `feedparser` for parsing. `selectolax` for the lightweight
  `<head>` parse (do not pull in BeautifulSoup for this).
- All outbound fetches in discovery and OG extraction go through one rate-limited client
  (`feeds/http.py`) with per-host concurrency 2, a 15s timeout, and a descriptive User-Agent
  including a contact URL. Respect `robots.txt` for the OG fetch.
- Batch discovery is a Celery task, never inline in the request. The API returns a job id in <200ms.
- Country codes are ISO 3166-1 alpha-2 everywhere. Reject anything else at the schema level.
- Never guess a source's rights. Default `link_only`, always.

## Constraints & non-goals
- No translation, no editions, no ranking, no digest, no share links — those are P6.
- No frontend — that is P7.
- No user accounts, no auth.
- No general web crawler. Discovery touches only the host the user pasted; OG extraction touches
  only URLs that already arrived through a subscribed feed.
- Do not download or re-host images, article bodies, or PDFs.
- Do NOT modify the analyst path: `kind='monitoring'` behavior, P3 signals, alerts and analyst
  reports must be identical after this phase.

## Implementation plan
1. Migration `0005_sources`: `content_rights` (with data migration from the boolean),
   `rights_note`, `document_media`, `domain_frameability`, `feed_subscriptions`,
   `source_import_jobs`, `source_import_results`, `api_sources`, and the `watchlists` additions.
   Verify: `upgrade head` → `downgrade -1` → `upgrade head` clean; full existing suite green.
2. `feeds/http.py` + `feeds/discovery.py` + tests against recorded fixtures for 8 real sites
   including one with no feed and one that only exposes a feed via an `<a>` tag.
3. `feeds/opml.py` (round-trip test) + `feed_subscriptions` CRUD + conditional polling in
   `connectors/rss.py`.
4. Batch import: job tables, Celery task, `POST /sources/batch` + `GET /sources/batch/{id}`.
5. Rights enforcement in `pipeline/normalize.py` + `PATCH /sources/{id}/rights`.
6. `document_media` extraction (RSS media first, OG fallback) + frameability probe + domain cache.
7. `api_sources` + wiring into `gdelt.py` / `perigon.py`.
8. Interests: `kind`, description embedding, country filters, hybrid matcher, interest routes,
   preview endpoint.

## Verification (definition of done)
- `uv run pytest` — all green. **Every P0–P4 test must pass unmodified.** If one must change, stop
  and report why instead of editing it.
- `uv run ruff check . && uv run mypy src/` — clean.
- **Rights gate:** `tests/pipeline/test_content_rights.py` — for a `link_only` source, ingesting a
  full article stores `body IS NULL` and `length(summary) <= 300`; for `extract_ok`, `<= 400`; for
  `full_ok`, the body is stored. Do not weaken this test.
- **Default-safety gate:** a newly discovered source created through `POST /sources/batch` always
  has `content_rights = 'link_only'`, and `PATCH /sources/{id}/rights` to `full_ok` without a
  `rights_note` returns 422.
- **Regression gate:** `tests/pipeline/test_matcher.py` passes unchanged, and a new test asserts
  monitoring-watchlist match output is identical on a 200-document fixture before and after the
  hybrid-matching change.
- **Country semantics gate:** `tests/pipeline/test_country_filter.py` — a Reuters (GB) article about
  Brazil matches `source_countries=['GB']` in `source` mode, matches
  `subject_countries=['BR']` in `subject` mode, and matches both in `either` mode. Never the wrong one.
- End-to-end scenario:
  1. `POST /sources/batch` with 20 pasted site URLs (mixed formats: bare domains, URLs with paths,
     one duplicate, one nonexistent domain) → job completes; results show `added` for the real
     sites, `duplicate` for the repeat, `invalid` or `no_feed` for the rest — no crash.
  2. Run ingestion; `SELECT count(*) FROM documents d JOIN sources s USING(source_id) WHERE
     s.id IN (batch sources)` is > 0, and `document_media` is populated with an `image_url` for
     the majority of them.
  3. `POST /interests` with a plain-English description, `subject_countries=['UA','PL']`,
     `country_match_mode='subject'` → `GET /interests/{id}/preview` returns matching documents,
     none of which are about other countries.
- Batch performance: 150 URLs complete in under 5 minutes.

## Working style
One commit per numbered step, conventional commits. Append a `## Sources & rights` section (≤20
lines) to `CLAUDE.md` documenting the three `content_rights` tiers, the "default `link_only`, never
infer" rule, the no-image-rehosting rule, and the source-vs-subject country distinction. Do not add
a dependency without listing it and its justification. Final report: number of feeds discovered from
the batch, discovery success rate, `document_media` coverage percentage, frameability rate across
domains, and any site whose feed you could not find and why.


---

# 13. P6 — Translation, Editions & Digest

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


---

# 14. P7 — Reader Site Frontend

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


---

# 15. P8 — Full Coverage

# Task: Build Full Coverage — story angles, multi-language framing analysis, and the coverage view

## Context
Read `CLAUDE.md` first, including the `## Sources & rights` and `## Reader product` sections.
P0–P4 built the monitoring system. P5 added sources, batch onboarding, content-rights tiers and
keyword+country interests. P6 added English translation, immutable editions, the headline digest and
share links. P7 built the English reader site, including a chronological coverage timeline on the
story page.

This phase adds the feature that separates a real news aggregator from a link list: **Full Coverage**
— not "here are 40 articles about the same thing", but "here is the story, and here are the
different angles it is being told from, by whom, in which languages, from which countries."

The comparative angle is the differentiator over Google News: because P2 already stores per-document
geo, language, source country and entity-targeted stance, the system can show how the same event is
framed differently across languages and regions. Nobody else in the reader's workflow can do that.

ASSUMPTION: Full Coverage applies only to event-backed stories with `source_count >= 4`. Below that
there is nothing meaningful to compare and the existing chronological timeline is correct.

## Objective
On a story with broad coverage, the reader sees: how many sources, countries and languages covered
it; a timeline of who published first and how it spread; the story broken into 2–5 distinct
**angles** with the sources grouped under each; and a short comparative note on what different
language and regional presses emphasize. Every claim in that analysis is traceable to specific
documents, and every source in it links out to its original.

## Requirements

### Angle detection
1. New table `story_angles` (migration `0007_full_coverage`): `id`, `event_id` fk cascade,
   `label` text (≤60 chars, English), `description` text (1–2 sentences), `document_count`,
   `source_countries` char2[], `langs` text[], `centroid` vector(1024), `share` float,
   `generated_at`, `model`. Plus `angle_documents` (`angle_id` fk cascade, `document_id` fk cascade,
   `similarity` float, composite pk).
2. `coverage/angles.py` — two-stage, cheap first:
   - **Stage A (no LLM):** sub-cluster the event's documents by embedding using agglomerative
     clustering with a cosine distance threshold of 0.25, minimum 2 documents per angle, maximum 5
     angles. Documents that do not join a cluster go to a residual bucket and are not shown as an
     angle. Seed the clustering with the `framing` strings already stored in
     `stance_assessments` when present — identical framings force co-assignment.
   - **Stage B (one LLM call per event):** send the sub-cluster structure to `claude-sonnet-5` —
     for each sub-cluster, its 3 most central headlines plus their source name, country and
     language — and get back an English `label` and `description` per angle, in
     `AnglesOut` (`llm/schemas.py`). The model **labels** the clusters; it does not create,
     merge or reassign them. State that constraint explicitly in `llm/prompts/angles.md`.
   - Recompute an event's angles when its `doc_count` grows ≥40% since `generated_at`, and never
     more than once per hour per event.
3. Prompt requirements for `llm/prompts/angles.md`: labels must be neutral and descriptive
   ("Economic impact", "Legal challenge", "Military response") — never evaluative, never a headline,
   never a slogan. The description states what this group of coverage focuses on, in the system's
   own words, without quoting any source beyond 10 consecutive words.

### Coverage statistics
4. `coverage/stats.py` — for an event, compute and cache in a new `event_coverage` table
   (`event_id` pk, `source_count`, `country_count`, `lang_count`, `first_published_at`,
   `first_source_id`, `peak_hour`, `by_country` jsonb, `by_lang` jsonb, `by_tier` jsonb,
   `stance_by_lang` jsonb, `stance_by_country` jsonb, `computed_at`):
   - `by_country` / `by_lang` / `by_tier`: `{key: {doc_count, source_count, first_at}}`.
   - `stance_by_lang` / `stance_by_country`: mean entity stance and negative share per group,
     computed only over documents with a `stance_assessments` row and **only when that group has
     ≥3 documents from ≥2 distinct sources**. Groups below that threshold are omitted entirely
     rather than reported with a weak number — a single article is not a national press position.
   - `first_source_id`: earliest `published_at` among non-duplicate documents. Surface it as
     "first reported by" only when the gap to the second source is ≥15 minutes; otherwise omit.

### Comparative framing note
5. `coverage/comparison.py` — one `claude-sonnet-5` call per event, only when the event has
   coverage in **≥3 languages or ≥4 countries**, producing `ComparisonOut`:
   `{summary: str, observations: [{group_type: 'lang'|'country', group_key: str, emphasis: str,
   supporting_document_ids: [uuid]}]}`.
   - Input is the angle structure plus, per language/country group with ≥3 documents, that group's
     translated headlines and framing labels. **Never the article bodies.**
   - `llm/prompts/comparison.md` must require: every observation cites at least 2
     `supporting_document_ids` drawn from the supplied set; no claim about a group that was not
     supplied; descriptive language about *what is emphasized*, never about motive, bias or
     credibility of any outlet or country; and an explicit statement when coverage is too uniform to
     compare rather than manufacturing a contrast.
   - Store in a new `event_comparisons` table (`event_id` pk, `summary`, `observations` jsonb,
     `model`, `generated_at`).
   - **Validation before persisting:** drop any observation whose `supporting_document_ids` are not
     all present in the input set or which cites fewer than 2. If more than half the observations
     are dropped, discard the whole comparison and log `comparison.rejected` rather than storing a
     partial one.

### API
6. Extend `GET /site/story/event/{id}` with a `coverage` object:
   `{stats: {...}, angles: [{label, description, document_count, share, source_countries, langs,
   sources: [StoryOut-lite]}], comparison: {summary, observations} | null,
   timeline: [{source_name, source_country, lang, published_at, url, angle_label}]}`.
   All source entries go through `site/serializers.py::to_story_out` — no exception for this route.
7. `GET /site/story/event/{id}/coverage?group_by=country|lang|angle|tier` returns the grouped source
   lists on their own for the UI's grouping control.
8. Celery: `compute_coverage(event_id)` runs after clustering for any event crossing
   `source_count >= 4`, throttled to once per hour per event, and is skipped entirely when the LLM
   daily budget guard from P2 is tripped (stats still compute — they cost nothing).

### UI (in `web/`, reader surface)
9. On `/site/story/event/[id]`, below the article header, a **Full Coverage** section, only rendered
   when `coverage.stats.source_count >= 4`:
   - A stat strip: `N sources · M countries · K languages · first reported by {source} at {time}`.
   - A grouping control: **By angle** (default) / **By country** / **By language** / **By source tier**.
   - By angle: one collapsible block per angle with its label, description, share bar, and the
     source list (each row: favicon, source name, country flag, publish time, translated headline,
     outbound link).
   - By country/language: same rows grouped, with a small horizontal bar showing each group's share
     of coverage.
   - A spread timeline: a compact horizontal chart of publications over time, dots colored by angle,
     with the first publication marked.
   - The comparison note rendered as a short paragraph plus its observations, each observation
     showing its supporting sources as inline chips that scroll to those rows. Prefix the block with
     a plain-language label: `How coverage differs` and a one-line disclosure that this is an
     automated comparison of headlines, with a link to the sources it used.
10. When `comparison` is null, render nothing for it — no placeholder, no "not enough data" box.
11. Front page: an event card whose event has ≥4 sources and ≥2 countries shows a
    `Full coverage · N sources` chip that deep-links to the coverage section anchor.

## Technical decisions (follow these — do not re-litigate)
- Embeddings do the clustering; the LLM only labels and compares. Any design where the model
  decides which articles belong together is wrong — it does not scale and it is not reproducible.
- Cost ceiling: at most 2 Sonnet calls per event per hour (angles + comparison), and only for events
  above the coverage thresholds. Everything else is SQL and vector math.
- Never quote more than 10 consecutive words from any source in a label, description or observation.
  Enforce with a post-generation check in `coverage/validate.py` that scans generated text against
  the input headlines and rejects the output on violation.
- The comparison describes *emphasis*, never bias, motive or credibility. This is a newsroom product;
  an automated claim that "Russian media is biased" is a liability, not a feature.
- Groups below 3 documents / 2 sources are omitted, never shown with a caveat.

## Constraints & non-goals
- No sentiment scoring of outlets or countries as entities. No "trust score" per country.
- No user-facing controls to tune thresholds. No angle editing.
- No new clustering path — reuse `events` from P2 and its embeddings.
- No changes to the monitoring dashboard, the digest, or share-link behavior beyond the coverage
  object appearing in the story payload that `/p/` routes already serve.
- Do not modify `site/serializers.py`'s rights enforcement. Extend it only by adding the coverage
  object built from already-serialized story entries.

## Implementation plan
1. Migration `0007_full_coverage`: `story_angles`, `angle_documents`, `event_coverage`,
   `event_comparisons`. Verify: up/down/up clean, full existing suite green.
2. `coverage/stats.py` + tests on a fixture event with 30 documents across 6 countries and 4
   languages — assert group thresholds are respected and under-threshold groups are absent.
3. `coverage/angles.py` Stage A (sub-clustering) + tests on a fixture event with 3 known angles —
   assert 3 clusters with ≥85% purity.
4. Stage B labelling + `llm/prompts/angles.md` + `coverage/validate.py` quote check.
5. `coverage/comparison.py` + `llm/prompts/comparison.md` + the citation-validation and rejection logic.
6. Celery wiring, throttling, budget-guard skip.
7. API: extended story payload + the `group_by` route.
8. UI: Full Coverage section, grouping control, spread timeline, comparison block, front-page chip.

## Verification (definition of done)
- `uv run pytest` and `cd web && npm run build && npm run lint && npm run test && npx tsc --noEmit`
  — all clean. **Every P0–P7 test passes unmodified.**
- **Angle purity gate:** `tests/coverage/test_angles.py` on the 3-angle fixture yields 3 angles with
  ≥0.85 purity and no more than 5 angles on any fixture. Do not weaken it.
- **Citation gate:** `tests/coverage/test_comparison_citations.py` — a mocked model response whose
  observations cite document ids absent from the input has those observations dropped; a response
  where most observations are invalid results in no stored comparison.
- **Quote gate:** `tests/coverage/test_quote_limit.py` — a mocked label containing 15 consecutive
  words from an input headline is rejected.
- **Threshold gate:** an event with coverage in 2 languages produces `comparison = null`; an event
  where one country has 2 documents omits that country from `stance_by_country`.
- **Rights gate (regression):** `tests/site/test_no_fulltext_leak.py` still passes with the coverage
  object present in the payload — no source text beyond the tier cap appears anywhere inside it.
- **Cost gate:** `scripts/cost_report.py --hours 24` shows at most 2 Sonnet calls per qualifying
  event per hour.
- End-to-end scenario: seed an event with 30 documents from 12 sources across 6 countries and 4
  languages, run `compute_coverage`, then open `/site/story/event/{id}`:
  1. The stat strip shows correct source/country/language counts and a "first reported by" line.
  2. By angle shows 2–5 labelled groups, each with its sources and outbound links.
  3. Switching to By country and By language regroups the same source rows with share bars.
  4. The comparison paragraph appears with observations whose source chips scroll to real rows.
  5. Every source row links to an external domain; no article body is visible anywhere.
- Uniform-coverage scenario: an event where all 12 sources say the same thing produces either one
  angle or a comparison stating coverage is uniform — never a fabricated contrast.

## Working style
One commit per numbered step, conventional commits. Append a `## Full Coverage` section (≤15 lines)
to `CLAUDE.md`: embeddings cluster, the LLM only labels; comparisons describe emphasis not bias;
groups below 3 docs / 2 sources are omitted; every observation must cite ≥2 documents from the input
set or it is dropped. Final report: angle counts per fixture event, comparison rejection rate,
Sonnet cost per event, and any event where the comparison was discarded and why.


---

# 16. סיכונים ומלכודות

## מלכודות טכניות

**Dedup הוא נושא נשא.** אם תדלג עליו או תיישם אותו רופף, כל מדד במערכת שקרי: velocity תספור 400
פרסומים של אותה ידיעה כ-400 אירועים, source diversity תקרוס, והדוח היומי יראה כמו רעש. ה-gate ב-P1
הוא לא פורמליות.

**סף האשכול (0.82) הוא הפרמטר הכי רגיש במערכת.** גבוה מדי — כל כתבה אירוע נפרד. נמוך מדי — כל
החדשות מתמזגות לאירוע ענק אחד. הוא חשוף כ-setting; כייל אותו מול הנתונים שלך בשבוע הראשון, לא לפי
התיאוריה.

**עברית וערבית.** רוב ה-APIs והמודלים המסחריים חלשים בשתיהן. אל תסמוך על סנטימנט שמגיע מספק
אמריקאי בעברית. ה-embeddings (`multilingual-e5-large`) מטפלים בעברית סביר; ה-stance עובר דרך LLM
בדיוק בגלל זה.

**GDELT מחזיר מטא-דאטה, לא גוף כתבה.** הוא רשת רחבה מצוינת ומקור עומק גרוע. אל תבנה עליו לבד.

**עלות ה-LLM היא החלטה ארכיטקטונית, לא אופטימיזציה מאוחרת.** אם תשנה את סדר הפעולות (embeddings →
Haiku → Sonnet) המערכת עדיין תעבוד — היא פשוט תעלה פי עשרים. ה-cost gates קיימים כדי שתגלה את זה
בבדיקה ולא בחשבונית.

## מלכודות מוצריות

**"סיקור שלילי" הוא לא סנטימנט שלילי.** כתבה על אסון תקבל סנטימנט שלילי גם אם היא מחמיאה ללקוח
שלך. המערכת מודדת stance כלפי ישות ספציפית, עם ראיה מצוטטת. אם מישהו יבקש "פשוט תשתמש בסנטימנט,
זה מספיק" — זו הנקודה שבה הדוח מתחיל לשקר.

**נפח הוא לא חשיבות.** 50 כתבות מ-3 מקורות זה קמפיין; 50 מ-40 מקורות זה אירוע. אל תדרג לפי
`doc_count`.

**"מדינת המקור" ו"מדינת הנושא" הן שתי שאלות שונות.** כתבה של רויטרס (בריטניה) על ברזיל. משתמשים
מבלבלים ביניהן תמיד — לכן שני הפילטרים נפרדים ומתויגים בשפה פשוטה (`Published in` / `About`).

**ההשוואה הבין-לשונית ב-P8 מתארת דגש, לא הטיה.** אמירה אוטומטית ש"התקשורת של מדינה X מוטה" היא
חשיפה משפטית ותדמיתית, לא פיצ'ר. הפרומפט אוסר את זה מפורשות ויש ולידציה שמפילה תצפית ללא ≥2 מקורות
מצוטטים.

## סיכונים חיצוניים

**נעילת פלטפורמות מחמירה, לא מתרופפת.** X עבר ל-pay-per-use ב-2026, Meta סגרה את CrowdTangle
וחוסמת גופי תקשורת מסחריים, TikTok לא פתחה API מסחרי כלל. תכנן שכל מקור סושיאל עלול להיסגר או
להתייקר — לכן הקונקטורים מבודדים מאחורי `BaseConnector` ואף אחד מהם אינו קריטי לתפקוד המערכת.

**ספקי צד ג' לנתוני X נמצאים באזור אפור.** הם זולים ב-90-99% ועובדים היטב. הם גם בהפרה של תנאי
השימוש של X. זו החלטה עסקית שלך, ואם המוצר מיועד ללקוחות חיצוניים — כדאי לעבור בה עם יועץ משפטי.

**רישוי תוכן הוא הסיכון הגדול ביותר במוצר הזה.** לא באג, לא downtime — תביעה של מו"ל. שלוש רמות
הזכויות, מגבלת התווים, ה-hotlinking וה-iframe הם המענה. הם נאכפים בקוד ובבדיקות בדיוק כדי שההגנה
לא תישחק בהדרגה כשמישהו ירצה "רק להציג קצת יותר".

---

*סוף המסמך.*
