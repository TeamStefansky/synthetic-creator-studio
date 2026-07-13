# Brand Watch — "is my entity under a disinformation attack?"

The product goal: **one main screen** where a user enters a client / brand /
product / keyword and sees, **live**, whether that entity is currently the
target of a coordinated disinformation attack — with the evidence behind the
verdict.

Everything already built (multi-source ingest, authenticity, coordination,
narratives, sentiment, manipulation index, alerts, keyword search, auto-refresh)
becomes the *engine*. Brand Watch is the *cockpit* on top of it.

---

## 1. The main screen

A single, prominent input: **"Enter a brand, client, product, or keyword"**.
On submit, one big result:

```
┌───────────────────────────────────────────────┐
│  ACME Corp                          🔴 UNDER ATTACK  │
│  Threat score 78/100 · ↑ 23 in last hour       │
│                                                │
│  Why:                                          │
│   ● Coordination      ████████░░  high   (2 campaigns, 14 accounts) │
│   ● Inauthentic amp.  ███████░░░  high   (61% bot-like)             │
│   ● Volume spike      ██████░░░░  med    (4.2× baseline)            │
│   ● Negative skew     ████████░░  high   (sentiment −0.6)           │
│   ● Narrative concen. ██████░░░░  med    ("ACME data leak" 48%)     │
│   ● Cross-source      ███████░░░  high   (5 platforms in 40 min)    │
│                                                │
│  [ Live evidence feed ]     [ Trend chart ]    │
└───────────────────────────────────────────────┘
```

- **Status band:** 🟢 Calm (0–33) · 🟡 Elevated (34–65) · 🔴 Under Attack (66–100)
- **Live evidence feed:** the actual posts driving the score, each linked to its
  source (X, Bluesky, GDELT, Reddit, news…), newest first.
- **Trend chart:** threat score + mention volume over time.
- **Auto-refreshing** (already built): the score updates itself; when it crosses
  a threshold an **alert** fires (already built).

---

## 2. The Threat Score (the core)

A 0–100 composite of independent, explainable signals — each computed **only over
posts about the entity** (see §4). Each signal returns score + confidence + a
plain-language reason, and they combine weighted-by-confidence (same pattern as
the authenticity engine).

| Signal | Question it answers | Built from |
|---|---|---|
| **Coordination** | Are accounts pushing the same content in lockstep? | coordination engine (campaigns) ✅ |
| **Inauthentic amplification** | Are the amplifiers bot-like? | authenticity engine + manipulation index ✅ |
| **Volume spike** | Is mention volume abnormally high vs baseline? | volume-over-time + stored baseline 🔧 |
| **Negative sentiment skew** | Is the conversation sharply, unusually hostile? | sentiment ✅ |
| **Narrative concentration** | Is one hostile narrative dominating? | narrative clustering ✅ |
| **Account newness / velocity** | Are freshly-created accounts driving it? | authenticity age-vs-volume signal ✅ |
| **Cross-source spread** | Is the same claim jumping platforms fast? | multi-source + content_hash ✅ |

**Status thresholds** are configurable; the defaults above are a starting point
and should be tuned against real events.

> Framing (important, legal/ethical): the output is **"indicators of a
> coordinated inauthentic campaign,"** with evidence — **not** a verdict that any
> specific person or post is fake. Same principle as the rest of the platform.

---

## 3. Continuous monitoring & alerting

- A **watchlist of entities** (brands/keywords) the user wants monitored 24/7.
- The scheduler (Render cron ✅, made more frequent) runs the pipeline **per
  watched entity** on its own schedule, recomputes the threat score, and stores
  a history point.
- When an entity's status **escalates** (e.g. Calm→Elevated or crosses 66) an
  **alert** fires (in-app / webhook / email — already built).
- The main screen shows the watchlist with a live status dot per entity.

---

## 4. The one real architectural addition: per-entity scoping

Today all searches pour into one shared dataset. To answer "**is *this* entity**
under attack," analysis must be scoped to the entity:

- Tag every ingested post with the **entity/query** that pulled it (`entity`
  column on `Post`, plus an `Entity`/watchlist table).
- Compute the threat score and all signals **filtered to that entity's posts**
  within a time window.
- This keeps ACME's score from being polluted by an unrelated search.

This is the main new backend work; the signals themselves mostly already exist.

---

## 5. What exists vs what to build

**✅ Already built:** 16-source keyword ingest, authenticity, coordination,
narratives, sentiment, manipulation index, alerts + rules + channels, live
auto-refresh, monitored-sources panel, forensic reports.

**🔧 To build for Brand Watch:**
1. `Post.entity` tag + `Entity`/watchlist table + migration.
2. **Threat-score engine** (`app/threat/engine.py`): the 7 signals → 0–100 +
   status + breakdown, scoped per entity.
3. Volume **baseline** storage (rolling) for the spike signal.
4. API: `GET /api/brandwatch?entity=...` (live score + breakdown + evidence +
   trend) and watchlist CRUD.
5. Per-entity scheduled monitoring + escalation alerts (extend cron + alert rules).
6. **Brand Watch UI**: the main screen (big status dial + signal bars + live
   evidence + trend) as the default Intelligence view.

---

## 6. Phasing — status

- **✅ Phase A (live one-shot) — built.** entity input → scoped ingest → threat
  score + 7-signal breakdown + live evidence + volume trend, auto-refreshing.
  (`Post.entity`, `app/threat/engine.py`, `GET /api/brandwatch`, Brand Watch UI.)
- **✅ Phase B (continuous) — built.** `WatchedEntity` + `ThreatSnapshot` tables;
  `app/watch/service.py` re-scans each watched entity, stores a snapshot, scores
  against a rolling baseline, and fires an **escalation alert** when the status
  worsens; `GET/POST/DELETE /api/watch`, `POST /api/watch/run`,
  `GET /api/watch/{id}/history`; hourly Render cron (`app.watch.runner`);
  Watchlist UI with live status dots.

Both phases are implemented. Future ideas: entity aliases/handles, per-entity
source weighting, competitor benchmarking, PDF situation reports.
