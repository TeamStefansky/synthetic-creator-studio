# NewsRadar — מסמך פיתוח

**גרסה 2026-07-27 · מסמך אחד, ליניארי, ללא patches.**
מאחד את כל האפיונים הקודמים. אם משהו כאן סותר מסמך ישן — זה גובר.

**ארטיפקטים נלווים** (כולם נכנסים ל-repo בפאזה 0):
`tokens.css` · `design-system.md` · `design-reference/*.png` · `brand/*.png` · `CLAUDE.md`

---

# חלק א — ההקשר המשותף

## 1. המוצר בפסקה אחת

דמות בארגון מגדירה את הנושאים שרלוונטיים לשוק שלה, מקבלת מדי יום מהדורה של הכותרות
החמות בהתאם, רואה את המספרים שמאחוריהן, ומייצאת דוח PDF ממותג לרשימת תפוצה.
ארבעה משטחים: **פיד** · **הגדרת נושאים** · **דשבורד** · **דוחות**.
עברית RTL, תוכן רב-לשוני, רב-משתמשים ברמת ארגון.

## 2. שש ההחלטות שכל השאר נגזר מהן

| # | ההחלטה | ההשלכה |
|---|---|---|
| 1 | **הלקוח הוא הארגון, לא המשתמש** | נושאים שייכים ל-Workspace. עובד שעוזב לא לוקח אותם |
| 2 | **recall גובר על precision** | שום דבר לא נופל בשקט. כיווץ עם מונה גלוי, לא סינון |
| 3 | **נושא הוא שאילתה, לא תגית** | must/should/not + ישויות + סף סמנטי + תצוגה מקדימה חיה |
| 4 | **Edition — חתך מוקפא ומתוארך** | ה-PDF וה-פיד הם אותו אובייקט. אפשר לומר "מהדורת 08:00" |
| 5 | **PDF נוצר בשרת** | Playwright על מסלול הדפסה ייעודי. לא `window.print()` |
| 6 | **הרשאות לפני מסכים** | שכבת יכולות אחת, פאזה 2, לפני שנבנה משטח כלשהו |

## 3. חוזה העיצוב

שלושה ארטיפקטים, לפי סדר סמכות:

1. **`tokens.css`** — הערכים. גובר בכל סתירה.
2. **`design-system.md`** — קונספט, סקאלה, רכיבים עם וריאנטים ומצבים, מפרט פריסה לכל מסך.
3. **`design-reference/*.png`** — הרנדרים המאושרים. קובעים תחושה, לא ערכים.

**חמישה כללים שאסור לוותר עליהם:**

- **אין צל על אף כרטיס בתוך העמוד.** קווי שיער ומרווח. צל רק ל-dropdown ו-modal.
  זו ההחלטה היחידה שהכי מרחיקה את התוצר מ"עוד דשבורד".
- **`radius` לא עולה על 8px.** צ'יפים 2, כפתורים וכרטיסים 4, modals 8.
- **שורת dateline בכל סיפור ובכל אירוע.** Mono 11, uppercase, tracking 0.12em,
  מעל קו 1px `--ink-900`, מפריד ` · `.
- **SourceStrip מלא בכל כרטיס.** בלי קיצור. במודיעין, "מי אמר" הוא חצי מהמידע.
- **צבע לעולם לא נשא יחיד של משמעות.** זה גם מה שמשאיר את ה-PDF קריא בשחור-לבן.

**נכסי מותג:** `brand/stem-logo-{white,ink,signal}.png`. הקובץ שסופק הוא knockout לבן
בלבד — על נייר בהיר ועל עמוד PDF הוא בלתי נראה, ולכן הופקו וריאנטים. יש **שני** לוגואים
במוצר ואסור לבלבל: לוגו STEM בכותרת האפליקציה, ולוגו **הארגון הלקוח** בכותרת כל עמוד
ב-PDF. פירוט מלא ב-`design-system.md`.

**אכיפה:** `pnpm lint:tokens` נכשל על hex גולמי, px מחוץ לרשימת היתר, או font-family
בקוד. אל תכבה אותו. בלי הבדיקה הזאת המערכת מתפרקת בפיצ'ר השלישי.

## 4. סנטימנט — המודל המלא

**שלוש תוויות בלבד**, נגזרות מציון רציף:

```
score ≤ −0.20            → NEGATIVE   תווית + אחוז
−0.20 < score < +0.20    → NEUTRAL    תווית בלבד, בלי אחוז
score ≥ +0.20            → POSITIVE   תווית + אחוז

confidence < FLOOR       → null       ללא תווית וללא משולש
```

- **שני מספרים, לא אחד:** `sentimentScore` (עוצמה וכיוון) ו-`sentimentConfidence`
  (כמה בטוחים). האחוז המוצג הוא `round(|score| × 100)`. הביטחון מוצג בנפרד.
- **סנטימנט הוא כלפי יעד, לא של מסמך.** האחוז על כרטיס בפיד הוא הסנטימנט כלפי
  הנושא שבסקציה שלו. אותו מסמך יכול להיות חיובי על נושא אחד ושלילי על אחר.
- **"ניטרלי" ו"לא דורג" הם שני דברים.** ניטרלי נספר בכל ממוצע — הוא מדידה שערכה
  אפס. לא-דורג לא נספר. לערבב אותם מטה כל ממוצע לאמצע באופן שיטתי.
- **המשולש:** ישר-זווית 36×36 בפינה השמאלית-עליונה של התמונה,
  `polygon points="0,0 36,0 0,36"`, אטימות 0.92.
  ירוק `--sentiment-positive` · כחול `--sentiment-neutral` · אדום `--sentiment-negative`.
  מסמך שלא דורג — **אין משולש כלל**.
- **התווית הטקסטואלית תמיד בשורת המטא**, כדי שהצבע לא יהיה הנשא היחיד.
- **הכיול הוא תנאי שחרור.** אחוז שאין לו דיוק ידוע הוא התחייבות שאי אפשר לעמוד בה.

## 5. מודל התפקידים

```
OrgMember.orgRole        OWNER · ADMIN · MEMBER
WorkspaceMember.role     MANAGER · ANALYST · VIEWER
```

ההרשאה האפקטיבית היא **איחוד** של השתיים. אין השוואת שם תפקיד בשום route ובשום
רכיב — הכל עובר דרך `can(actor, capability, resource)` שנשען על מטריצה שהיא
**מבנה נתונים**, לא שרשרת תנאים.

---

# חלק ב — סדר הבנייה

13 פאזות, ליניארי. כל פאזה מסתיימת במצב עובד ובדיק. ה-verification של פאזה N הוא
תנאי הכניסה ל-N+1. פאזה אחת לכל סשן.

```
 0  Scaffold + token contract
 1  Data model
 2  Identity + capability layer      ← לפני כל מסך
 3  Ingestion + matching engine
 4  Sentiment calibration harness    ← לפני המסווג
 5  Sentiment classifier
 6  Topic configuration              ← לפני הפיד
 7  Feed
 8  Reports + server-side PDF
 9  Scheduled reports + approval
10  Dashboard
11  Admin console
12  Hardening
```

**שלושה סדרים שנראים הפוכים ואינם:**
הרשאות לפני מסכים, כי הרשאות שמתקינים בסוף נבדקות בשלושה מקומות ומתפצלות.
מערך כיול לפני המסווג, כי מסווג שבונים ואז מודדים מייצר מספר שאי אפשר להגן עליו.
הגדרת נושאים לפני הפיד, כי פיד בלי מנוע התאמה עובד הוא דמו על נתוני דמה.

---

## פאזה 0 — Scaffold + token contract

```markdown
# Task: Scaffold the newsradar monorepo and enforce the design token contract

## Context
Greenfield. Read CLAUDE.md first — stack, architecture map and design contract live there and are
not open for renegotiation. The visual system already exists and must not drift: read `tokens.css`
(authoritative values), `docs/design-system.md` (concept, component variants and states, per-screen
layout) and `docs/design-reference/*.png` (approved renders). All three are committed in this phase.

## Objective
`pnpm dev` serves a Hebrew RTL page at :3000 rendering a NewsRadar header, one dateline strip and
one source strip built entirely from tokens, plus a Fastify API at :3001 answering `GET /health`.
`pnpm lint:tokens` passes on that code and fails on a planted violation.

## Requirements
1. pnpm 9 workspace matching CLAUDE.md's architecture map exactly. TypeScript 5.6 strict via a
   shared `tsconfig.base.json`.
2. `apps/web`: Next.js 15 App Router, React 19. next-intl with `he` default (`dir="rtl"`) and `en`.
   Fonts via `next/font`: Newsreader, IBM Plex Sans, IBM Plex Sans Hebrew, IBM Plex Mono,
   Frank Ruhl Libre — only the weights listed in design-system.md section 1.
3. `tokens.css` imported once in the root layout. CSS Modules for components. **No Tailwind, no
   CSS-in-JS** — the token contract is far easier to enforce in plain CSS.
4. **`pnpm lint:tokens`**: an ESLint rule plus a scanner over `apps/web` that fails on raw hex,
   raw `px` outside a small allowlist (border widths, 1px rules), and hardcoded font-family
   strings. Output names the file, the line, and the token that should have been used. Wired into
   `pnpm lint`.
5. Build three reference components now — every later component copies their shape:
   - `<DatelineStrip>` — mono 11, uppercase, `--track-meta`, `--ink-300`, under a 1px `--ink-900`
     rule, ` · ` separators, numbers in `--ink-900` weight 500.
   - `<SourceStrip>` — favicon, source name, country flag, relative time, external-link arrow.
   - `<SentimentTriangle>` — 36×36 SVG, `polygon points="0,0 36,0 0,36"`, opacity 0.92, fill from
     `--sentiment-positive` / `--sentiment-neutral` / `--sentiment-negative`. Renders **nothing**
     when passed a null sentiment. A `@media print` rule gives each value a distinct fill —
     solid / dashed / outline — so the printed PDF stays readable in black and white.
6. `packages/core/bidi`: `composeMeta(parts): string` wrapping each Latin or numeric segment in
   U+2068/U+2069 isolates. Both strip components use it. Export a React `<Bidi>` helper too.
7. `apps/api`: Fastify 5, Zod type provider, `/health`, pino logging.
8. `docker-compose.yml`: `pgvector/pgvector:pg16`, `redis:7-alpine`, named volumes,
   `.env.example` documenting `DATABASE_URL`, `REDIS_URL`, `SMTP_*`.
9. Commit `brand/` with all logo variants. Build `<Wordmark variant="white"|"ink"|"signal">`
   selecting the correct asset for its surface, with a 24px minimum height guard and `--sp-4`
   clear space. **The supplied master is a white knockout** — it is invisible on `--paper-reader`
   and on a white PDF page, which is why the ink variant exists. Never recolour at runtime with a
   CSS filter; use the correct asset.
10. ESLint flat config, Prettier, Vitest 2, Playwright, all root scripts from CLAUDE.md.

## Constraints & non-goals
- No auth, no schema, no product screens. No component library — the design system is bespoke.
- No CI workflow, no app Dockerfiles.
- No dependency outside CLAUDE.md without listing and justifying it first.

## Verification
- `docker compose up -d && pnpm typecheck && pnpm lint && pnpm test` all green.
- `curl localhost:3001/health` → `{"status":"ok"}`; localhost:3000 renders `<html lang="he" dir="rtl">`.
- Plant `color: #ff0000`: `lint:tokens` fails naming file and line. Remove it: passes. Show both.
- Test: `composeMeta(["רויטרס","GB","14:32 UTC","9 מקורות"])` emits isolates around each
  Latin/numeric segment.
- Test: `<SentimentTriangle sentiment={null}/>` renders no DOM node.

## Working style
One commit, `chore: scaffold monorepo and token contract`. Report pinned dependencies and the exact
token-lint rules implemented.
```

---

## פאזה 1 — Data model

```markdown
# Task: Define the complete Prisma schema, migrations and seed

## Context
Phase 0 delivered the scaffold. Read CLAUDE.md. This phase fixes the persistent shape of the whole
product — later phases only add columns. Two decisions drive it: topics belong to a Workspace,
and reports store snapshots rather than references.

## Objective
`pnpm db:migrate && pnpm db:seed` produces one organization, two workspaces, five members spanning
every role combination, ~15 topics, ~40 sources across all three rights levels, ~600 documents with
embeddings in five languages, two editions, two report templates and two schedules.

## Requirements — identity and tenancy
1. `Organization`: id, name, logoUrl, defaultClassification enum (INTERNAL, RESTRICTED,
   CONFIDENTIAL), verifiedDomains string[], approvalRequiresClassification enum nullable,
   approvalRequiresExternalRecipient bool, approvalRecipientThreshold int nullable,
   personalAnalyticsEnabled bool default **false**, retentionDays int default 90.
2. `Workspace`: id, orgId, name, description, timezone (IANA), editionTimes string[] `HH:mm`.
3. `Member`: id, orgId, email unique, name, orgRole enum (OWNER, ADMIN, MEMBER) default MEMBER,
   status enum (INVITED, ACTIVE, DEACTIVATED), invitedById, invitedAt, lastSeenAt, deactivatedAt.
4. `WorkspaceMember`: workspaceId, memberId, role enum (MANAGER, ANALYST, VIEWER), grantedById,
   grantedAt. `@@unique([workspaceId, memberId])`.

## Requirements — content and matching
5. `Topic`: id, workspaceId, name, isActive, createdById, mustTerms/shouldTerms/mustNotTerms
   string[], entities string[], languages string[], publishedInCountries string[],
   aboutCountries string[], precision float 0–1, sourceMode enum (ALL, ONLY, EXCEPT),
   sourceIds string[], `embedding vector(384)`, sentimentAlertEnabled bool,
   sentimentAlertThreshold float nullable, sentimentAlertOnShift bool,
   excludeReportedSpeech bool default **true**, excludeOpinion bool default **true**.
6. `Source`: id, name, domain, feedUrl, country, language, tier int 1–3, faviconUrl, isActive,
   failureCount, lastPolledAt, rights enum (HEADLINE_LINK, SHORT_EXTRACT, FULL_TEXT_LICENSED)
   default HEADLINE_LINK, rightsChangedById, rightsChangedAt, rightsNote text.
7. `Document`: id, sourceId, url unique, headline, headlineOriginal, language, summary, imageUrl,
   publishedAt, ingestedAt, countriesMentioned string[], entities string[], clusterId nullable,
   isOpinion bool default false, `embedding vector(384)`,
   sentimentScore float nullable, sentimentConfidence float nullable, sentimentLabel enum
   (POSITIVE, NEUTRAL, NEGATIVE) nullable, sentimentModel, sentimentModelVersion,
   sentimentComputedAt.
   **`sentimentLabel` is null when confidence is below the floor — never NEUTRAL.**
8. `TopicMatch`: topicId + documentId unique, score float, matchedOn string[], matchType enum
   (TERM, SEMANTIC, ENTITY, MIXED). `matchedOn` is what the feed renders as "why am I seeing this".
9. `EntitySentiment`: documentId, targetType enum (TOPIC, ENTITY), targetId, score, confidence,
   label enum nullable, evidenceSpan text, evidenceOffset int, isReportedSpeech bool,
   sentenceCount int, scoreStdev float. `@@unique([documentId, targetType, targetId])`.
   `scoreStdev` has no UI in v1 — it is a free byproduct of the per-sentence pass and backfilling
   it later would mean re-running the model over the whole archive.
10. `SentimentOverride`: documentId, targetType, targetId nullable, score, label enum, memberId,
    reason text **required**, createdAt. `@@unique([documentId, targetType, targetId])`.

## Requirements — editions, reports, scheduling
11. `Edition`: id, workspaceId, issuedAt, label, status enum (LIVE, PUBLISHED, ARCHIVED), itemCount.
    `EditionItem`: editionId, documentId, topicId, rank, isLead bool.
12. `ReportTemplate`: id, workspaceId, name, title, subtitle, classification, logoUrl,
    includeDashboard, sectionOrder Json, createdById.
13. `Report`: id, workspaceId, editionId nullable, templateId nullable, title, subtitle,
    classification, recipientName, logoUrl, includeDashboard, createdById,
    status enum (DRAFT, RENDERING, READY, SENDING, SENT, FAILED),
    approvalStatus enum (NOT_REQUIRED, PENDING, APPROVED, REJECTED), approvedById, approvedAt,
    rejectionReason, scheduleRunId nullable, pdfPath nullable, createdAt.
14. `ReportItem`: reportId, documentId, order, angleLabel, analysisPoints string[3], plus
    **snapshots**: headlineSnapshot, summarySnapshot, sourceNameSnapshot, publishedAtSnapshot,
    sourceCountSnapshot, rightsSnapshot, sentimentLabelSnapshot, sentimentScoreSnapshot,
    sentimentEvidenceSnapshot, sentimentWasOverridden bool.
    Snapshots are mandatory: a sent report must render identically after the publisher edits the
    article or the classifier is re-run.
15. `Recipient`: reportId, email, isExternal bool, status enum (PENDING, SENT, FAILED), sentAt, error.
16. `ReportSchedule`: id, workspaceId, templateId, name, ownerId, frequency enum (DAILY, WEEKDAYS,
    WEEKLY), timeOfDay `HH:mm`, weekday int nullable, timezone (IANA),
    selectionMode enum (TOP_N_BY_HEAT, ALL_MATCHES, CURATION_WINDOW), topN, curationWindowMinutes,
    emptyPolicy enum (SEND, SKIP, SEND_WITH_NOTE) default SEND_WITH_NOTE,
    approvalTimeoutMinutes int default 60,
    onApprovalTimeout enum (SKIP, SEND_INTERNAL_ONLY) default SKIP,
    status enum (ACTIVE, PAUSED, SUSPENDED), consecutiveFailures int, nextRunAt, lastRunAt.
    `ScheduleRecipient`: scheduleId, email, isExternal.
17. `ScheduleRun`: id, scheduleId, scheduledFor, status enum (PENDING, APPROVAL_WAITING, APPROVED,
    REJECTED, CURATING, RENDERING, SENT, SKIPPED, FAILED), reportId, approvedById, approvedAt,
    rejectionReason, error, startedAt, finishedAt.
    **`@@unique([scheduleId, scheduledFor])` — the send-once guarantee. A retrying worker must fail
    this write rather than mail a distribution list twice.**

## Requirements — metrics and audit
18. `MetricSample`: topicId, bucketStart, bucketMinutes, docCount, sourceCount, countryCount,
    languageCount, meanSentiment float nullable, negativeShare float nullable,
    sentimentSampleCount int. `@@unique([topicId, bucketStart, bucketMinutes])`.
19. `SentimentEvalItem`: documentId, targetType, targetId, language, labelA enum, labelB enum,
    finalLabel enum, annotatorA, annotatorB, createdAt.
20. `AuditLog`: id, orgId, actorId, action, targetType, targetId, metadata Json, createdAt.
    Append-only. Indexes on (orgId, createdAt DESC) and (actorId, createdAt DESC).
21. Indexes: HNSW cosine on `Document.embedding` and `Topic.embedding`;
    `Document(publishedAt DESC)`, `Document(clusterId)`, `TopicMatch(topicId, score DESC)`,
    `MetricSample(topicId, bucketStart DESC)`, `EntitySentiment(targetId, score)`.

## Technical decisions
- pgvector via `Unsupported("vector(384)")`, read/written only through typed helpers in
  `packages/core/db/vector.ts`. No raw SQL elsewhere.
- Seed embeddings from `@xenova/transformers` / `Xenova/multilingual-e5-small`, `passage: ` prefix
  for documents, `query: ` for topic centroids. Cache under `.cache/`, gitignored.
- Deterministic seed, fixtures in `prisma/fixtures/`. Documents span Hebrew, English, Arabic,
  German and French with realistic mixed-direction headlines so bidi is exercised from day one.

## Verification
- Migrate + seed runs clean from empty, twice, idempotently.
- Two `ScheduleRun` rows with the same (scheduleId, scheduledFor) are rejected.
- The seeded cross-role member resolves MANAGER in workspace A and VIEWER in workspace B.
- A cosine query from a seeded Hebrew document returns semantically related documents in other
  languages. `EXPLAIN` shows the HNSW index, not a sequential scan.
- Three seeded documents are positive toward one topic and negative toward another — the case that
  justifies per-target sentiment. Assert both rows exist with opposite signs.
- A `ReportItem` still reports its snapshot headline after `Document.headline` is changed.

## Working style
Commit schema+migration separately from seed. Report row counts per table and the language
distribution of document fixtures.
```

---

## פאזה 2 — Identity + capability layer

```markdown
# Task: Build authentication, actor context, and one capability layer enforced on every route

## Context
Phases 0–1 delivered the scaffold and the full schema. Read CLAUDE.md.
This phase runs before any product screen, deliberately: permissions retrofitted after screens
exist get re-derived in every handler and drift apart within weeks.

## Objective
Every route runs with a resolved actor, every mutation is authorized through one pure `can()`
driven by a data table, and denials return a machine-readable reason the UI can render.

## Requirements
1. **Auth**: email magic link. `POST /auth/request` (single-use token, 15-min expiry, hashed at
   rest), `GET /auth/verify` (session cookie: httpOnly, secure, sameSite=lax, 30-day rolling),
   `POST /auth/logout`. Sessions in Redis, keyed so deactivation revokes all of a member's.
2. **Actor middleware**: resolves `ActorContext { memberId, orgId, orgRole, workspaceRoles, status }`,
   cached 60s in Redis, invalidated on any role or status change. DEACTIVATED → 401 everywhere.
3. **`packages/core/authz/` — pure, no I/O:**
   - `Capability` union: `topic.read|write|delete`, `report.create`, `report.send.internal`,
     `report.send.external`, `report.send.classified`, `report.approve`,
     `schedule.create|manage`, `member.invite|setRole|deactivate`,
     `source.manage|setRights`, `policy.manage`, `workspace.create`,
     `audit.read.workspace|org`, `analytics.read.aggregate|personal`, `billing.manage`,
     `sentiment.override`.
   - **`CAPABILITY_MATRIX` as a data structure**, role → capability set. Effective = union of the
     org-role grant and the workspace-role grant for the resource's workspace.
   - `can(actor, capability, resource): { allowed, reason }` with `reason` a typed enum
     (`NOT_A_MEMBER`, `WRONG_WORKSPACE_ROLE`, `REQUIRES_MANAGER`, `MEMBER_DEACTIVATED`,
     `POLICY_REQUIRES_APPROVAL`, `SOURCE_RIGHTS_FORBID`). The reason is rendered — a denial
     without one produces support tickets.
4. **Policy-derived capabilities**: `report.send.external` and `report.send.classified` consult org
   policy, not only role. An ANALYST adding an external address gets `POLICY_REQUIRES_APPROVAL`,
   which the UI presents as "will be sent for approval", not as a failure.
5. **`requireCapability(cap, resourceResolver)`** Fastify decorator on every mutating route.
   Write a test that enumerates the route table and asserts every non-GET route carries it.
6. `GET /me/capabilities` returns the effective set per workspace so the client can disable
   controls. **The client check is presentation only**; the server check is the real one.
7. Invitations: `POST /members/invite` (email, orgRole, workspace roles) → INVITED member + email.
8. Deactivation: `POST /members/:id/deactivate` requires `successorId`. One transaction: set
   DEACTIVATED, revoke sessions, transfer owned `ReportSchedule` and draft `Report` to the
   successor. **Never deletes topics** — topics belong to the workspace.
9. Every authorization-relevant mutation writes an `AuditLog` row with before/after.

## Technical decisions
- `packages/core/authz` has no database access. Handlers load the resource and ask.
- Server-side sessions, not JWTs — instant revocation on deactivation is a requirement.
- No caching beyond the 60s actor cache; a role change takes effect within a minute.

## Constraints & non-goals
- No SSO, SAML, SCIM, OAuth, passwords or 2FA. Magic link only.
- No custom roles, no per-topic ACLs. No admin UI — that is phase 11.

## Verification
- **Matrix test**: a generated table test over every (role × capability) pair with the exact
  expected decision. Exhaustive, not sampled — this test is the specification.
- The cross-role member is allowed `topic.write` in workspace A and denied `WRONG_WORKSPACE_ROLE`
  in workspace B.
- Route-coverage test: add a route without `requireCapability` and it fails. Show that output.
- Deactivating a member with two schedules and one draft transfers all three in one transaction,
  revokes sessions within one request, and leaves their topics untouched.
- An ANALYST adding an external recipient gets `POLICY_REQUIRES_APPROVAL`, not 403.

## Working style
One commit each for auth, capability layer, route enforcement, invite/deactivate. Print the full
capability matrix and list any capability defined but not yet enforced anywhere.
```

---

## פאזה 3 — Ingestion + matching engine

```markdown
# Task: Build ingestion, enrichment, and the topic matching engine

## Context
Phases 0–2 delivered schema and authorization. Read CLAUDE.md. This is the engine every surface
reads from. Matching must be pure and in `packages/core/matching/` — phase 6's live preview calls
the same function the background matcher calls, and if they diverge the preview lies to the user.

## Objective
`pnpm ingest:once` polls every active source, normalizes and clusters items, enriches them, and
writes a `TopicMatch` for every matching (topic, document) pair with a score and the terms that fired.

## Requirements
1. `workers/ingest`: poll `feedUrl` with a 10s timeout, parse RSS/Atom, normalize to headline,
   summary, url, imageUrl, publishedAt, detected language.
2. Quality gate with recorded reasons: missing headline, body under 120 chars, unparseable or
   future-dated `publishedAt`, duplicate URL.
3. Clustering: exact by canonical URL; near-duplicate by cosine above 0.90 within 48h → shared
   `clusterId`. **Collapse, never drop** — every clustered document stays a row.
4. `workers/enrich`: embedding, entity extraction, `countriesMentioned`, `isOpinion` from section
   metadata plus a small heuristic.
5. **`packages/core/matching/match.ts`**, pure:
   `matchTopic(topic, doc): MatchResult | null`
   - `mustTerms`: all must appear (normalized, diacritic- and case-insensitive, Hebrew-aware),
     otherwise no match regardless of semantic similarity.
   - `mustNotTerms`: any hit vetoes.
   - `shouldTerms` and `entities`: score, do not gate.
   - Semantic: cosine(topic centroid, doc embedding) above a threshold derived from
     `topic.precision` over a documented range (broad 0.28 → precise 0.62).
   - `publishedInCountries` checks the source's country; `aboutCountries` checks
     `countriesMentioned`. **Different filters — do not conflate.**
   - Language filter, source-mode filter.
   - Returns `{ score, matchedOn, matchType }` where `matchedOn` names the actual terms that fired.
6. `workers/match`: on each new document evaluate every active topic and upsert `TopicMatch`.
   On topic edit, re-evaluate the last 7 days for that topic only.
7. `workers/rollup`: `MetricSample` rows per topic per 15-minute bucket.
8. One failing source never aborts a run: log, increment `failureCount`, continue.

## Technical decisions
- Every stage is a pure function in `packages/core/`; workers are thin I/O shells. Tests target the
  pure functions over fixtures.
- `rss-parser`. No headless browsing, no full-article scraping. No LLM calls — the pipeline is
  deterministic and runs offline in tests.

## Constraints & non-goals
- No translation, no sentiment yet (phases 4–5). `headlineOriginal` is stored.

## Verification
- Table tests: a document missing a `mustTerm` never matches even at cosine 0.95; a `mustNotTerm`
  vetoes a strong match; raising `precision` 0.2→0.9 monotonically reduces matches on a fixed
  corpus; `publishedInCountries: ["DE"]` and `aboutCountries: ["DE"]` select different sets from
  the same corpus; `matchedOn` names exactly the terms present.
- `pnpm ingest:once` over local XML fixtures inserts expected counts; a second run inserts zero.
- A broken fixture feed is logged and skipped without aborting the run.
- Two fixture articles about one event share a `clusterId` and both rows still exist.

## Working style
One commit per worker plus one for matching. Print the precision→threshold mapping and the fixture
match counts at each level.
```

---

## פאזה 4 — Sentiment calibration harness

```markdown
# Task: Build the sentiment evaluation harness and label the held-out set

## Context
Phases 0–3 delivered ingestion and matching. Read CLAUDE.md. No classifier exists yet, deliberately:
this phase builds the instrument that decides whether the classifier may ship.

The product surfaces a percentage that will appear in classified PDFs sent to distribution lists.
Per-language accuracy is not optional — the corpus is Hebrew, English, Arabic, German and French,
and most sentiment tooling is English-first.

## Objective
`pnpm eval:sentiment` prints per-language accuracy, MAE on the continuous score, inter-annotator
agreement and a calibration curve for any `SentimentClassifier`, and exits non-zero when a language
falls below the release floor.

## Requirements
1. `packages/core/sentiment/types.ts`: `SentimentClassifier` —
   `score(text, target, language): Promise<{ score, confidence, evidenceSpan, evidenceOffset,
   isReportedSpeech }>`. Defined now so classifier and harness share one contract.
2. Labelling CLI: presents a document and a target, collects POSITIVE / NEUTRAL / NEGATIVE, stores
   a `SentimentEvalItem`. Two annotator passes, **Cohen's kappa** between them. Ship 100 labelled
   items per language in `prisma/fixtures/sentiment-eval/`; adjudicate and record disagreements.
3. `pnpm eval:sentiment` reports **per language**: exact-match accuracy on the 3-label scale;
   negative-vs-rest F1 (missing negative coverage is the costly error here); MAE on the continuous
   score; a confusion matrix; and a calibration curve bucketing predictions by confidence into 10
   bins with observed accuracy per bin — **this is what the confidence floor is chosen from**.
4. **Release floor, enforced by exit code**: exact-match accuracy ≥ 0.75 per language and
   kappa ≥ 0.6. A failing language reports `NOT RELEASABLE`.
5. A no-op baseline classifier (always neutral, confidence 0.5) so the harness is testable and
   there is a floor to beat. Report its row.
6. Committed baseline in `docs/sentiment-baseline.md`, regenerated on every classifier change.

## Constraints & non-goals
- Do NOT write the real classifier here. Interface, labelling tool, metrics and baseline only.

## Verification
- Runs against the baseline and prints a complete per-language table plus the calibration curve.
- A deliberately poor stub causes a non-zero exit naming the failing languages.
- Unit tests: kappa correct on a hand-computed example; MAE and confusion matrix correct on fixtures.
- 100 labelled items exist per language with recorded kappa.

## Working style
One commit each for interface+metrics, labelling CLI, labelled fixtures. Report kappa per language
and flag where annotators disagreed most.
```

---

## פאזה 5 — Sentiment classifier

```markdown
# Task: Implement per-target multilingual sentiment scoring in the enrichment pipeline

## Context
Phase 4 delivered the harness and the release floor. Read `packages/core/sentiment/types.ts` and
`packages/core/matching/match.ts` before writing.

## Objective
Every enriched document carries a document-level sentiment plus one `EntitySentiment` row per
matched topic and per detected entity, each with a verbatim evidence span — and
`pnpm eval:sentiment` clears the release floor for every enabled language.

## Requirements
1. Implement `SentimentClassifier` with a local multilingual sentence-level model via
   `@xenova/transformers`. No external API calls: deterministic, cheap, offline in tests.
2. **Per-target aggregation** — the point of the feature:
   split into sentences (language-aware) → score each → for a target, weight each sentence by
   proximity to the nearest mention (same sentence 1.0, adjacent 0.5, elsewhere 0.15) and by its
   own confidence → the aggregate is the target's score; the highest-contributing sentence becomes
   `evidenceSpan`, quoted **verbatim**, with its offset. Store `scoreStdev`.
3. **Reported speech**: mark a sentence when its polarity sits inside a quotation or follows an
   attribution verb (per-language verb list). A quoted attack by a rival is not the outlet's stance,
   and in market intelligence that distinction changes the conclusion.
4. **Label derivation** — one exported constant `SENTIMENT_THRESHOLDS`, three labels only:
   `score ≤ −0.20 → NEGATIVE · −0.20 < score < +0.20 → NEUTRAL · score ≥ +0.20 → POSITIVE`.
   The label is always derived from the score, never independently computed. The design's original
   five-step chip collapses to these three on every screen, including negative coverage.
5. **`SENTIMENT_CONFIDENCE_FLOOR` is a constant**, its value taken from the phase-4 calibration
   curve with the chosen bin cited in a comment. Below it, `sentimentLabel` is null and the
   document renders **no chip and no triangle** — never silently recorded as NEUTRAL.
6. `getSentiment(documentId, target)` in `packages/core/sentiment/`: returns an override when one
   exists, otherwise the model result, and always reports which. Returns `null` below the floor.
   **Every surface calls this; nothing reads the raw columns.**
7. `sentiment:rescore` job on model-version change. **Never touches `ReportItem` snapshots.**
8. Only languages clearing the release floor are enabled, in one `ENABLED_LANGUAGES` constant.
   A disabled language produces no chip, not a guess.
9. Wire into `workers/enrich`. One document failing to score never aborts the run.

## Technical decisions
- All scoring pure in `packages/core/sentiment/`; the worker is an I/O shell.
- Do NOT introduce a new colour scale — `--sentiment-*` tokens already exist for the triangle and
  `--stance-*` for chips on paper.

## Constraints & non-goals
- No aspect-level sentiment, no sarcasm detection, no mixed/contested category, no training on
  overrides — overrides are collected as data only.
- Do NOT change the matching engine.

## Verification
- `pnpm eval:sentiment` passes the release floor for every enabled language. Commit the updated
  baseline and state which languages you disabled and why.
- Fixture tests: a document positive toward topic A and negative toward topic B yields two rows
  with opposite signs — assert both; a quoted negative statement is flagged `isReportedSpeech`;
  Hebrew negation ("לא הצליח", "אינו מספק") scores negative; the derived label matches the
  threshold table at every boundary including exactly −0.20 and +0.20.
- **Neutral vs not-rated**: a balanced fixture above the floor yields NEUTRAL; a below-floor fixture
  yields `null`. Assert the accessor never returns NEUTRAL for the second, that the second is
  excluded from a computed mean, and that the first is included.
- Re-scoring does not alter any existing `ReportItem` snapshot. All phase-3 tests pass unchanged.

## Working style
One commit each for classifier, per-target aggregation, reported speech, wiring. Report the
per-language accuracy table and the confidence floor with the calibration bin justifying it.
```

---

## פאזה 6 — Topic configuration

```markdown
# Task: Build the topic configuration screen with a live preview

## Context
Phases 0–5 delivered matching, authorization and sentiment. Read CLAUDE.md, `tokens.css`, and
**section 6, screen R4** of `docs/design-system.md`. Read `packages/core/matching/match.ts` before
writing — the preview must call that exact function, never a reimplementation.

This is the screen the product lives or dies on. A user who cannot see what a definition will
return is configuring blind and stops trusting the product a day later.

## Objective
From `/topics` a user creates a topic, watches a live preview of the last five matches update as
they type and drag the precision slider, sees an estimated volume, saves, and the feed reflects it.

## Requirements
1. Two columns: definition form inline-start, live preview inline-end. Hebrew RTL.
2. Fields: name; must / should / must-not terms as removable chips; entities; languages;
   published-in countries and about countries **visually distinct with a one-line explanation of
   the difference**; source mode with a picker; precision slider.
3. **Precision slider is labelled `רחב ← → מדויק`, never a number.** A number invites over-tuning
   of a value the user cannot interpret.
4. **Live preview**: `POST /topics/preview` takes an unsaved definition, returns the five most
   recent matches plus estimated 7-day volume. Debounced 400ms. Each row is a full StoryCard with
   dateline, SourceStrip, sentiment triangle and label, and the `matchedOn` terms as chips — so the
   user sees *why* each result matched.
5. Volume estimate as a mono headline with a qualitative reading: under 5/day "צר מדי",
   5–80 "טוב", over 200/day "רחב מדי", each with a one-line suggestion. Show the preview's mean
   sentiment too — a definition returning uniformly negative results usually captured a crisis term.
6. Sentiment section: alert toggle, threshold by label rather than number, shift-alert toggle,
   and `החרג דיבור מדווח` / `החרג מאמרי דעה` both **on by default** with one-line explanations.
   A user who does not know these are excluded will misread every average in the product.
7. Topic list: name, 7-day sparkline, last match time, active toggle, edit, delete. Deleting warns
   if the topic appears in a saved report.
8. Search filters existing topics; no match shows a dashed `--signal-600` card offering to create
   that string as a new topic; Enter creates it.
9. VIEWER sees definitions read-only with an explanatory banner. Every mutation audits.

## Technical decisions
- The preview runs the real `matchTopic` over a bounded window (7 days, max 5,000 documents) —
  never an approximation. Cache per definition hash in Redis, 60s.
- TanStack Query v5. Preview is its own query keyed by the debounced definition hash.
- **Do NOT build a preset category tree.** A topic is a query. Ship 6 editable example definitions
  relevant to market intelligence (regulation, competitors, reputation, supply chain, key
  executives, sector M&A) as starting points, not as fixed categories.

## Verification
- e2e: typing a must-term updates the preview within 1s; dragging precision broad→precise reduces
  results; adding a must-not term present in the top result removes it; a VIEWER cannot mutate.
- Unit: the preview endpoint and the background matcher return identical `MatchResult` arrays for
  the same definition and document set.
- Toggling `החרג מאמרי דעה` changes the preview's mean sentiment on a fixture containing opinion.
- Keyboard-only pass over the whole form, covered by e2e. `lint:tokens` green.

## Working style
One commit each for API, form, preview, list. Report the example definitions shipped and the volume
each returns on seed data.
```

---

## פאזה 7 — Feed

```markdown
# Task: Build the feed surface with editions, newspaper layout, sentiment and per-card actions

## Context
Phases 0–6 delivered matching, topics and sentiment. Read CLAUDE.md, `tokens.css`, and
**section 6, screen R1** of `docs/design-system.md`, which specifies grid, column spans and
vertical rhythm. Mirror the components built in phase 0.

The layout is an editorial newspaper page, not a card grid. The size gap between the lead headline
and everything else is the entire feel of the product — do not compress it.

## Objective
A user opens `/`, sees the current edition's lead story at hero size, a three-up row and a section
per topic; switches between live, current and archived editions; and can pin, hide, mark
not-relevant, block a source, correct sentiment, or add any story to a report from its card.

## Requirements
1. **Editions**: header shows `EDITION 14:30` in mono, or `LIVE · 14:52` with a pulse dot. A
   switcher lists today's editions and the archive. Live mode shows a non-intrusive
   "7 פריטים חדשים" bar the user clicks to merge — content never moves under the reader's cursor.
2. Layout per design-system R1: 64px header → hairline → filter bar (topics, countries,
   published-in/about toggle, 6h/24h/3d) → 1px `--ink-900` rule → lead story over 8 of 12 columns
   with a 3:2 image in the remaining 4 → 96px air → three-up → 96px → one section per topic with a
   mono uppercase label between hairlines, a 31px lead item and a hairline-separated headline list.
3. Every card: dateline, headline, SourceStrip, source count, a mono `reason` line rendering the
   topic name and `matchedOn` terms, and the translated-original headline below in `--ink-300`
   with `dir="auto"` when translated.
4. **Sentiment on every card, two layers:**
   - `<SentimentTriangle>` at top-left of the image — the fast scan layer.
   - The text label in the metadata row — `שלילי 68%` for positive/negative,
     **`ניטרלי` with no percentage**, so colour is never the sole carrier.
   - **Below the confidence floor: no triangle and no label.** Absence reads as "not rated" without
     inventing a fourth term.
   - The value shown is the sentiment toward **the topic whose section the card sits in**, not the
     document average. Expanded card names the target (`כלפי: רגולציית AI`), shows the verbatim
     evidence span in a blockquote with a 2px inline-start border in the matching colour, and shows
     confidence as a separate figure.
   - Overridden items show a mono `תוקן ידנית` marker with the correcting member on hover.
5. Clustered stories collapse to one card with `+38 מקורות` expanding inline. **Nothing is hidden
   without a visible count.**
6. Per-card `⋯`: קבע למעלה · הסתר · לא רלוונטי לנושא הזה · חסום מקור · תקן סנטימנט
   (three-label picker + required reason, gated on `sentiment.override`) · **הוסף לדוח**
   (increments a header badge). Each optimistic with visible rollback.
7. Filter bar gains `הכל / חיובי / ניטרלי / שלילי` and a `השלילי ביותר` sort. All filter state in
   the URL so a filtered feed is shareable.
8. Designed empty state: "3 נושאים · 0 פריטים חדשים מאז 08:00" with a link to topic settings.
9. Source-domination warning when one source exceeds 40% of the edition — a configuration bug
   surfacing, not a preference.
10. Accessibility: `<article>` with real headings, keyboard-operable focus-trapped menu, alt text,
    polite live-region announcements.

## Technical decisions
- Server Component for first paint of an edition, Client Component for live updates and actions.
- Editions are materialized by a job at each `editionTimes` entry; the feed reads them. Live mode
  queries `TopicMatch` directly.
- No infinite scroll on an edition — an edition is finite and that is the point. Archive paginates.

## Verification
- e2e: the lead headline's computed font-size is ≥ 3× the three-up headline; blocking a source
  removes its cards and it does not return after reload; "הוסף לדוח" increments the badge and
  persists; the empty state renders; a cluster expands; `dir="rtl"`; every card action is reachable
  by keyboard alone.
- **Design-contract assertions, automated in the DOM**: no in-page card has a box-shadow; every card
  has a dateline and a SourceStrip; every sentiment indicator present carries a text label; a
  below-floor card renders no triangle element at all.
- A document matching two topics displays different sentiment values in the two sections. Assert both.
- `lint:tokens` green. Lighthouse accessibility ≥ 95, CLS < 0.1 — commit the numbers.

## Working style
One commit each for the edition job, layout, cards, sentiment display, action menu. Report any
design-contract assertion you could not automate.
```

---

## פאזה 8 — Reports + server-side PDF

```markdown
# Task: Build the report builder with server-rendered PDF, source-rights enforcement and approval

## Context
Phases 0–7 delivered the feed and "הוסף לדוח". Read CLAUDE.md.

An earlier prototype exported via `window.print()`. **Do not.** A scheduled 08:00 report has no open
browser, and every recipient would get a different rendering — particularly for Hebrew, where mixed
metadata lines break differently across engines. Generation is server-side, and the preview renders
the same route the PDF is made from, so what the user sees is exactly what ships.

## Objective
A user assembles a report from an edition, sets title, classification and logo, selects stories,
sees a page-accurate A4 preview, and downloads or sends it — with per-recipient status and audit.

## Requirements
1. Three columns at `/reports/[id]`: content selection, A4 preview, settings.
2. Selection: edition picker, per-topic grouped checkbox list, select-all/clear, drag to reorder.
   Items added from the feed appear pre-selected. Each candidate shows its rights badge and
   sentiment label.
3. Per item, editable in place: `angleLabel` and up to three `analysisPoints` — what makes the
   document a briefing rather than a clipping list.
4. Settings: title, subtitle, classification, recipient name, org logo upload (PNG/SVG, ≤2MB,
   MIME-sniffed), language, include-dashboard toggle.
   **The logo on the report is the customer organization's, never STEM's.** A report leaving a
   government body carrying prominent vendor branding is a commercial problem, not a feature. If a
   `powered by` line is wanted at all it goes in the page footer at caption size, and only when
   explicitly enabled.
5. **`/reports/[id]/print`** — print-only route: A4 pages, `@page` margins, no app chrome, same
   tokens. Page header carries logo and classification; footer carries classification, page number,
   edition timestamp and report id. **Classification on every page.** Cover page: title, subtitle,
   date, edition, recipient, stat strip, and a **sentiment summary** — mean, three-label
   distribution bar, change versus the previous report.
6. **Source rights enforced by the renderer, not merely displayed.** `ReportItem.rightsSnapshot`
   gates content: `HEADLINE_LINK` → headline, source, timestamp, link only, no summary;
   `SHORT_EXTRACT` → plus ≤200 chars then an ellipsis and the link; `FULL_TEXT_LICENSED` →
   unrestricted. `angleLabel` and `analysisPoints` are original work and are never restricted.
   Where trimmed, the PDF prints `תקציר מוגבל לפי רישיון המקור` — a reader must be able to tell
   "nothing was said" from "we may not quote it".
7. **Sentiment in print**: label plus number for positive and negative, label only for neutral,
   nothing for unrated. The triangle renders with a distinct fill per value (solid / dashed /
   outline) so the document is fully readable in black and white. **Unrated items are excluded
   from the mean, not counted as neutral**; the summary states `12 מתוך 15 פריטים דורגו`.
   Footer methodology line: model, version, confidence floor.
8. `workers/report-render`: Playwright Chromium loads that route with an internal render token and
   emits a PDF. The in-app preview is an iframe of the same route — one renderer, no divergence.
   **Fonts embedded locally**, never fetched at render time.
9. **Approval gate**: `POST /reports/:id/send` calls `can()`. On `POLICY_REQUIRES_APPROVAL` the
   report goes to `approvalStatus: PENDING` and is **not queued**; workspace managers are notified.
   `/approve` and `/reject` (mandatory reason) require `report.approve`. The approver sees the
   rendered preview and the full recipient list with external addresses marked.
10. Recipients: chips with validation, paste-many, CSV import. `POST /send` returns `queued`
    immediately; `workers/report-send` mails each with the PDF attached, retries transient SMTP
    failures 3× with backoff, updates per-recipient status. **No route sends mail inline.**
11. All mixed-direction strings go through `packages/core/bidi`. Every render and send audits with
    classification and the full recipient list; the filename embeds classification and timestamp.

## Constraints & non-goals
- No rich-text editing of story text. No DOCX or PPTX. No public share links. No scheduling yet.

## Verification
- `pnpm report:render <id>` produces a PDF. Assertions on output: page count matches the preview;
  classification appears on every page; logo on page 1; extracted text contains every selected
  headline and no deselected one.
- **Rights test**: one item per rights level — extracted text contains the summary for
  FULL_TEXT_LICENSED, a truncated summary plus the licence note for SHORT_EXTRACT, and no summary
  for HEADLINE_LINK.
- **Bidi snapshot test**: Hebrew headlines with Latin source names and numeric timestamps — assert
  the extracted logical order of a metadata line. **This is the test not to skip.**
- Editing `Document.headline` after adding it, then re-rendering, still shows the snapshot headline.
- A report of only below-floor items renders `0 מתוך N פריטים דורגו`, not a mean of zero.
- An ANALYST sending externally yields PENDING and zero queued jobs; a MANAGER approving yields
  exactly one job per recipient; rejection returns it to DRAFT with the reason visible.

## Working style
One commit each for builder UI, print route, rights enforcement, render worker, send worker,
approval. Report page count and file size of a 12-item render, and every bidi case tested.
```

---

## פאזה 9 — Scheduled reports

```markdown
# Task: Build templates, schedules, the run state machine and the curation window

## Context
Phase 8 delivered manual reports with server-side PDF, rights enforcement and approval.
Read `workers/report-render` and `workers/report-send` before writing — scheduling **composes**
those workers, it does not reimplement them.

## Objective
A schedule runs at its configured local time, assembles a report per its selection mode, passes
through approval if policy requires, renders and sends — with per-run status, no possibility of
double-sending, and failures that alert the owner rather than the recipients.

## Requirements
1. **Templates** at `/reports/templates`: branding, title pattern supporting `{date}`, `{edition}`,
   `{workspace}`, classification, section order, include-dashboard. "Save as template" from any report.
2. **Schedule editor**: template, frequency, time of day, **IANA timezone defaulting to the
   workspace's**, selection mode, empty policy, recipients, approval timeout and timeout behaviour.
   Shows the **next three computed run times in local time** as a live preview — how a user catches
   a timezone mistake before it costs them a week.
3. **Scheduler**: a job every minute finds schedules past `nextRunAt` and creates a `ScheduleRun`
   with `scheduledFor` set to the intended slot. **The unique constraint on
   (scheduleId, scheduledFor) is the idempotency guarantee** — a duplicate insert is caught and
   treated as "already handled", never retried. Recompute `nextRunAt` DST-aware in the schedule's
   timezone. **Never store or compute a schedule in UTC.**
4. **Selection modes**: `TOP_N_BY_HEAT`; `ALL_MATCHES` grouped by topic; `CURATION_WINDOW` —
   assemble the draft, notify owner and analysts, move to `CURATING`, stay editable until
   `scheduledFor + curationWindowMinutes`, then proceed with whatever state it is in.
   Curation is the recommended default for a morning brief: assembled at 07:00, an hour to fix
   angles, out at 08:00 whether or not anyone touched it.
5. **Empty policy** `SEND` / `SKIP` / `SEND_WITH_NOTE`, rendered as a designed block. Silence makes
   recipients assume the system broke; an unexplained empty report makes them stop opening it.
6. **Run state machine**, exactly:
   `PENDING → [CURATING] → [APPROVAL_WAITING → APPROVED] → RENDERING → SENT`,
   with `SKIPPED`, `REJECTED`, `FAILED` terminal. Every transition persisted and audited.
   A pure reducer in `packages/core/schedule/state.ts`; illegal transitions throw.
7. **Approval timeout**: past `approvalTimeoutMinutes`, apply `onApprovalTimeout` — `SKIP` or
   `SEND_INTERNAL_ONLY` (external recipients dropped, and the run records which).
   **No path exists where an unapproved classified report sends because nobody responded.**
8. **Failure handling**: render → verify → send. A render failure sets `FAILED`, notifies owner and
   managers, and sends nothing. Two consecutive failures set the schedule `SUSPENDED`.
9. Schedules survive their creator's deactivation via the phase-2 transfer. A suspended or orphaned
   schedule must never fail silently.
10. `POST /schedules/:id/run-now` with a synthetic `scheduledFor`, same authorization and approval.
11. Notifications to owner and managers only: approval waiting, curation opened, render failed,
    send failed, suspended. **Recipients receive the report and nothing else.**

## Technical decisions
- Next-run computation pure in `packages/core/schedule/next-run.ts`, timezone-aware, unit-tested
  across a DST transition in `Asia/Jerusalem` in both directions.
- Reuse render and send workers unchanged. If they need a change, state why first.

## Constraints & non-goals
- No quiet hours, holiday calendars, per-recipient personalization, multi-step approval chains,
  or sub-daily frequencies.

## Verification
- **Idempotency**: invoking the scheduler twice for one slot creates one run and one send per
  recipient. Then kill the send worker mid-run and restart — still exactly one send per recipient.
- **DST**: a daily 08:00 `Asia/Jerusalem` schedule produces correct UTC instants across both 2026
  transitions. Assert the literal timestamps.
- **Approval timeout**: unapproved past timeout ends `SKIPPED` under SKIP, and sends only to
  internal recipients under SEND_INTERNAL_ONLY, recording dropped addresses. **Zero external sends
  in both cases.**
- All three empty policies behave as specified against an empty edition.
- A `CURATION_WINDOW` run is editable during the window, locks at the deadline, sends the edit.
- A forced render failure leaves recipients with zero mail and notifies owner and managers;
  a second consecutive failure sets `SUSPENDED`.

## Working style
One commit each for templates, editor, scheduler, state machine, curation, notifications.
Print the transition table and the DST timestamps asserted.
```

---

## פאזה 10 — Dashboard

```markdown
# Task: Build the monitoring dashboard — heat board, geography, trends, sentiment, negative coverage

## Context
Phases 0–9 delivered everything the dashboard measures. Read CLAUDE.md and **section 6, screens
M1–M3** of `docs/design-system.md`, which specify density, panel layout and the negative-coverage
treatment. `MetricSample` rows exist from phase 3's rollup.

This surface is deliberately denser than the feed — 16/24 rhythm, numbers in IBM Plex Mono with
tabular figures, hairline separators, no shadows, no zebra striping. The feed answers "what
happened"; the dashboard answers "is anything anomalous".

## Requirements
1. Pure metrics in `packages/core/metrics/`: `volume`, `velocity`, `acceleration`, `heat` 0–4,
   `lift`, `sourceBreadth`.
2. **Heat is normalized against each topic's own baseline, not globally.** A permanently noisy topic
   must not sit at heat 4 forever; a quiet topic that jumped 6× must reach it. Document the
   normalization in a comment and cover it with a test.
3. Four sentiment metrics, also pure:
   - `meanSentiment` — weighted by confidence and source tier, over **rated documents only**,
     honouring the topic's reported-speech and opinion exclusions. **Neutral documents are
     included** — a neutral is a measurement whose value is zero.
   - `negativeShare` — share of rated documents labelled NEGATIVE. Often more legible for a manager
     than a mean; show both.
   - `classifiedShare` — share clearing the floor. The health gauge for the whole feature: if it
     collapses in one language, the classifier broke there and no average will reveal it.
   - `sentimentShift` — 24h mean against the topic's own 7-day baseline in standard deviations.
     **The alerting metric**, same philosophy as `acceleration`: a permanently negative topic is not
     news; a neutral topic that inverted within a day is.
4. Layout: 220px topic sidebar with counts; 56px header with topic name, 1h/6h/24h/7d control,
   alerts bell with count.
5. Heat board over 8 of 12 columns: HeatBadge (mono number on a heat-ramp background), 60×20
   sparkline, 20px/500 Hebrew title, dateline, trajectory arrow, country flags, sentiment indicator
   and trend arrow. Hairlines, 16px gaps, no shadows.
6. Geographic heat map over 4 columns: MapLibre, muted basemap, warm blobs. Country click filters
   the whole screen. Trends strip below: term, lift multiplier, mini bar comparing 7-day to current.
7. Bottom volume bar: ingested vs previous period, with the duplicate-collapsed portion as a muted
   segment — the user should see how much was collapsed, not just what remained.
8. Topic detail: sentiment time series with the three-label distribution stacked beneath, plus
   breakdowns by country and by source tier. Divergence between tiers — tier 1 neutral, tier 3
   hostile — is a signal in itself and should be visible without configuration.
9. Negative coverage: grouped by entity; negativity gauge; 14-day area chart; document rows with
   sentiment label and percentage, SourceStrip, and the **verbatim evidence span in a blockquote
   with a 2px `--danger` inline-start border**. Reported speech and opinion in visually separate
   groups, excluded from the headline count.
10. Alerts: a topic crossing its threshold or exceeding 2σ `sentimentShift` raises an alert naming
    the topic, the shift and the three most negative documents with their evidence.
11. **Every number is clickable** and drills to the documents behind it. A number that cannot be
    decomposed will not be trusted in a meeting. Each event card has "הוסף לדוח".

## Technical decisions
- All metric math pure and unit-tested over synthetic series. Charts: lightweight in-repo SVG for
  sparkline, gauge and area. MapLibre is the only external chart dependency.
- `tabular-nums` on every numeric column. Heat and sentiment colours from tokens, never in chrome.

## Constraints & non-goals
- No custom layouts, no widget drag-and-drop, no forecasting or anomaly ML.

## Verification
- Metric tests over synthetic series: constant high volume → low acceleration and low heat;
  a 6× step change → heat 4; `lift` correct for a term that doubled share; `sourceBreadth` counts
  distinct sources not documents.
- **Sentiment metric tests**: a constantly negative topic yields low `sentimentShift` while a topic
  inverting within 24h yields a high one; **neutral documents are included** in `meanSentiment`
  while below-floor documents are excluded — a corpus of only neutral yields `meanSentiment ≈ 0`
  with `classifiedShare = 1.0`, and a corpus of only below-floor yields a null mean with
  `classifiedShare = 0`. **These two must not be confusable.**
- e2e: clicking a country filters the board; clicking a number opens the document list with a
  matching count; every HeatBadge contains a numeral and every sentiment element a text label —
  asserted programmatically. No dashboard card carries a box-shadow.

## Working style
One commit per panel. Report the baseline normalization formula and the synthetic series validating it.
```

---

## פאזה 11 — Admin console

```markdown
# Task: Build the seven-tab admin console at /admin

## Context
Phases 0–10 delivered the product and the phase-2 enforcement layer. Read CLAUDE.md and
`packages/core/authz/`. This phase builds UI over authorization that already exists — it must not
introduce a second source of truth.

Density follows the dashboard: 40px rows, hairlines, no zebra, mono tabular numbers.

## Requirements
1. `/admin` requires at least one workspace MANAGER role. Tabs render only for capabilities the
   actor holds, driven by `GET /me/capabilities`. **A tab hidden in the UI is still enforced server-side.**
2. **חברים והרשאות**: name, email, org role, per-workspace role chips, last seen, status.
   Invite, change role, deactivate, transfer ownership.
   - **A role change shows its consequences before confirming**: which capabilities are gained and
     lost, how many topics become uneditable, how many schedules transfer. Computed by diffing
     capability sets from `packages/core/authz` — never a hand-written string, so it stays correct
     when the matrix changes.
   - **Deactivation requires a successor** and lists every asset that will transfer.
3. **סביבות עבודה**: topic count, members, editions/day, timezone. Create, rename, archive.
   Archive, never delete — the audit log must stay interpretable.
4. **מדיניות** (ADMIN+): default classification, verified domains, approval thresholds, retention,
   and the personal-analytics toggle.
   **That toggle defaults off and its confirmation dialog states plainly that enabling it records
   per-member reading activity, that members will be shown a notice, and that enabling it is itself
   written to the audit log.** Do not soften this copy.
5. **מקורות** (ADMIN+): name, domain, country, tier, last poll, failures, **rights**, active. Bulk
   add by URL with per-row status chips carrying text, never colour alone. Changing rights opens a
   dialog requiring a written justification stored in `rightsNote` and audited. Show one row in a
   warning state (3 failures) and one deactivated with a reactivate action.
6. **דוחות מתוזמנים**: every schedule across the actor's workspaces — name, workspace, owner,
   frequency, next run in local time, last status, recipient count. Pause, run now, transfer.
   **Any schedule with two consecutive failures renders in a `--danger` state at the top** — the
   only place a broken schedule becomes visible before recipients complain.
7. **יומן ביקורת**: filterable by actor, action, date range, workspace; CSV export. Report sends
   display classification and the full recipient list. Append-only.
8. **שימוש**: aggregate only by default — members who opened the latest edition, topics by click
   share, reports sent, schedule reliability. Per-member figures appear only when the org toggle is
   on, and the tab then shows a persistent notice.
9. **Coverage assurance panel**: topics with zero matches in 14 days, topics over 200/day, topic
   pairs whose result sets overlap by more than 70%, sources currently failing, and
   `classifiedShare` per language. Each row links to the fix. This panel is what keeps the product
   from quietly rotting after two months.
10. Every mutating action audits and shows optimistic state with visible rollback.

## Technical decisions
- All authorization from `packages/core/authz`. **Grep `apps/web/app/admin` for role literals and
  expect none — add that grep as a test.**

## Constraints & non-goals
- No billing UI, no SSO config, no custom role builder, no bulk member CSV import.
- No new permission logic — this phase renders and calls the phase-2 layer.

## Verification
- e2e: a VIEWER gets 403 on `/admin`; a MANAGER sees membership and schedules but not policy or
  sources; an ADMIN sees all seven tabs.
- Changing ANALYST → VIEWER shows a consequence dialog naming the exact capability count lost and
  schedules transferring; after confirming, that member is denied `topic.write` within 60 seconds.
- Deactivating without a successor is blocked by UI and API.
- Changing rights without a justification is rejected; with one, the audit row contains the note.
- A schedule with two consecutive failures appears at the top in the danger state.
- Grep test: zero role-name literals in `apps/web/app/admin`.

## Working style
One commit per tab. List every capability the console exposes and confirm each is enforced
server-side, plus anything rendered read-only because enforcement was missing.
```

---

## פאזה 12 — Hardening

```markdown
# Task: Resilience, observability, permission fuzzing and the explainability surface

## Context
Phases 0–11 delivered the complete product. Read CLAUDE.md. Add no features.

## Requirements
1. **Graceful degradation**, each tested: Redis down → preview and feed serve without cache;
   embedding model unavailable → matching falls back to terms and entities only and the UI says so;
   sentiment model unavailable → documents render with no triangle and no label, never a guess;
   a source feed timing out → excluded from that run; Playwright render failure → report `FAILED`
   with a readable error, never silently.
2. **Explainability** `GET /feed/:documentId/why`: the topic, matched terms, semantic score, the
   threshold it cleared, its rank, and its sentiment with the evidence span and confidence.
   Surfaced in the card menu as "למה זה כאן". This is what makes users trust the topic editor.
3. **Authorization fuzz**: for every mutating route, generate a request from every role and assert
   the decision matches `CAPABILITY_MATRIX`. **Generated from the route table**, not hand-written,
   so new routes are covered automatically.
4. **Session revocation**: deactivation invalidates sessions within 60 seconds across web and API.
   Test with a live session.
5. **Scheduler resilience**: with Redis down, no run is created and none is lost — the next healthy
   tick picks up the missed slot exactly once. With SMTP unreachable, recipients stay PENDING and
   retry; they never silently move to SENT.
6. **Audit completeness**: an automated check that every route with `requireCapability` writes an
   `AuditLog` row on success. List any that do not and justify each.
7. Structured logging with a request id propagated web → api → worker: one line per feed request
   with candidate counts per topic and per-stage latency; one per render and per send.
8. Rate limiting and input hardening on all routes; security pass on cookie flags, CORS, upload
   MIME sniffing, and the internal render token.
9. `docs/RUNBOOK.md`: cold start, resetting a workspace, granting and revoking access, recovering a
   suspended schedule, unsticking an approval, reading the explainability output, tuning
   `precision` safely, interpreting `classifiedShare`, and answering "who received this classified
   report" from the audit log.

## Constraints & non-goals
- No new features. Anything noticed goes into NOTES.md. Do NOT change matching thresholds,
  ranking weights or sentiment formulas — behaviour must stay identical.

## Verification
- Everything green: `pnpm test && pnpm test:e2e && pnpm lint && pnpm lint:tokens && pnpm typecheck`.
- Chaos specs pass for each dependency in requirement 1.
- **Full journey from an empty database**: seed → ingest → sign in → create a topic with live
  preview → publish an edition → read the feed → correct one sentiment → add three stories to a
  report → render the PDF → send to two addresses → schedule a daily report → open the dashboard
  and drill from a number into its documents → open the admin console and change a role.
- `pnpm eval:sentiment` matches the phase-5 committed numbers — proving no drift.

## Working style
One commit per requirement group. Final report: every failure mode tested, every permission gap
found, everything documented rather than fixed.
```

---

# חלק ג — צ'קליסטים

## שחרור הסנטימנט
- [ ] `eval:sentiment` עובר את הרף בכל שפה מופעלת; `sentiment-baseline.md` מעודכן ב-repo
- [ ] שפות מתחת לרף מושבתות ומציגות כלום — לא ניחוש
- [ ] סף הביטחון נלקח מעקומת הכיול, והבין המצוטט מופיע בהערה בקוד
- [ ] בדיוק שלוש תוויות. אין מונח רביעי בשום מקום ב-UI
- [ ] מסמך מתחת לסף — בלי משולש ובלי תווית, ומוחרג מכל ממוצע
- [ ] ניטרלי נספר בממוצעים ומוצג בלי אחוז
- [ ] אחוזי הפיד הם per-target — מסמך בשני נושאים מוכיח זאת
- [ ] דיבור מדווח ומאמרי דעה מוחרגים כברירת מחדל וה-UI אומר זאת
- [ ] המשולש מובחן ב-print; לכל ערך יש גם תווית טקסט
- [ ] ה-PDF מציין מודל, גרסה וסף ביטחון
- [ ] אנליסט יכול לתקן; התיקון מסומן, מבוקר, וגובר בכל מקום

## חוזה העיצוב
- [ ] אין ערך צבע שאינו טוקן · אין מרווח מחוץ לסולם 4
- [ ] `radius` לא עולה על 8px בשום מקום
- [ ] **אין צל על אף כרטיס בתוך העמוד**
- [ ] כל סיפור ואירוע נושאים dateline · כל כרטיס נושא SourceStrip מלא
- [ ] צבע לעולם לא נשא יחיד — heat נושא מספר, סנטימנט נושא תווית
- [ ] focus ring זהה בכל שדה וכפתור · ניגודיות גוף ≥ 4.5:1, UI ≥ 3:1
- [ ] מצבי ריק, טעינה ושגיאה מעוצבים
- [ ] RTL: מחרוזות מעורבות עוברות דרך `packages/core/bidi`
- [ ] `prefers-reduced-motion` מבטל תנועה · measure ≤ 68 תווים

## אמינות
- [ ] `unique(scheduleId, scheduledFor)` קיים ונבדק בהרג עובד באמצע ריצה
- [ ] תזמונים נשמרים בשעה מקומית + tz, ונבדקו בשני מעברי שעון
- [ ] אין מסלול שבו דוח מסווג נשלח בלי אישור
- [ ] כשל רינדור לא מייצר שליחה חלקית; הנמענים לא מקבלים התראות תפעוליות
- [ ] `ReportItem` שומר snapshot; ריסקור לא משנה דוח שנשלח
- [ ] כל route שאינו GET נושא `requireCapability`, ובדיקה אוכפת זאת
- [ ] השבתת חבר מעבירה תזמונים ודוחות, מבטלת סשנים, ולא מוחקת נושאים

---

# החלטות פתוחות

1. האם ANALYST יוצר דוח מתוזמן פנימי ללא אישור — הנחתי **כן**.
2. האם `CURATION_WINDOW` הוא ברירת המחדל לדוח בוקר — אני ממליץ **כן**.
3. **הרנדרים בתיקיית הייחוס הם בסגנון כהה, בעוד `design-system.md` מגדיר נייר בהיר
   `#FAF9F5`. חייבים להכריע לפני פאזה 7, אחרת הסוכן מקבל שני אותות סותרים.**
   הלוגו שסופק הוא לבן בלבד, וזו עדות נוספת לכיוון הכהה — אבל שער ה-PDF לבן בכל מקרה,
   ושם נדרשת גרסת ה-ink. שני המשטחים יתקיימו במקביל ולכן שתי הגרסאות נחוצות ממילא.
4. **חסר קובץ SVG ללוגו.** PNG ב-3213px מספיק להדפסה אבל לא לכותרת ב-24px. זו הבקשה
   היחידה שנשארה פתוחה מול המעצב.
