# Layer 03 · P0 — discovery + characterization (report)

No production code. Deliverables: characterized tool output shapes, fixtures
(`tests/case/fixtures/tool-outputs.ts`), target-behavior specs
(`tests/case/target-behavior.test.ts`), and this plan. Stop at the gate.

## Characterized output shapes (evidence-bearing fields the adapters will read)

| Tool | Type (lib/types.ts) | Evidence-bearing fields | Time tier of its dates |
|---|---|---|---|
| Site Report | `Report` | `domain`, `infrastructure.domain.value.{registrar,createdAt}`, `hosting.value.{ip,asn,asnOrg,cdn}`, `ssl.value.{sanDomains,issuer,validFrom}`, `tech.value.{gaIds,adsenseIds}`, `archive.value.firstSeen`, `originTrace.{likelyOrigin,candidates}`, `geography.{server,dns,mail}` | RDAP `createdAt`, SSL `validFrom` = **T1**; wayback `firstSeen` = **T2**; fetch time = **T4** |
| Post Check | `PostCheckResult` | `claims[]`, `sources[]`, byline/`datePublished` in note | self-reported byline = **T3** |
| Log Analyzer | `LogAnalysisResult` | `topIps[].{ip,enrichment,contentPath[].timestamp}`, `timeline[]` | own/third-party server log = **T1** |
| Email Tracer | `EmailTraceResult` | `hops[].{ip,enrichment,timestamp}`, `originIp`, `auth` | `Received` header time = **T1–T2** (relaying MTA-observed) |
| Link Board | `BoardResult` | `edges[].{a,b,strength,items[]}`, `fingerprints[]` | n/a (structural; carries `rubricVersion`) |
| Clue index | `lib/clues/*` | shared `net_org` / IP / GA / SAN across searches | n/a |

## EvidenceItem mapping (P1 `lib/case/ledger.ts`)

`id = hash(kind, entityKey, normalizedValue)` — **excludes sourceUrl**, so one fact
from two tools collapses to one row with two `sourceLineage` provenances (a
corroboration signal). Each field's source:
- `contentHash` — hash of retrieved bytes at acquisition (site fetch body, log text,
  raw headers). For derived facts (an ASN from an IP) hash the upstream response.
- `timeTier` — assigned by the adapter per the table above; **T4 encoded as an
  upper-bound-only type**, never usable as a lower bound for ordering.
- `sourceGrade`/`infoCredibility` — default **F6**; move off only with justification
  (e.g. RDAP registry = A2/A1). `lib/case/grading.ts`.
- `sourceLineage` — syndication/registry-mirror detection via `lib/similarity/*`;
  shared lineage ⇒ one corroboration weight.

## Adapters to write in P1 (`lib/case/adapters/`, one per source, pure + fixture-tested)

`site.ts`, `post.ts`, `logs.ts`, `email.ts`, `board.ts`, `clues.ts`. Each: tool output
→ `EvidenceItem[]`; never invents an unsourced field; missing grade = F6.

## Module plan for layer 03 (per phase)

- P1 `types.ts`, `ledger.ts`, `grading.ts`, `calibrate-time.ts`, `adapters/*`
- P2 `timeline.ts` (claim identity via `lib/similarity`), banned-vocab lint
- P3 `graph.ts`, `cluster.ts`, `path.ts` (direction matrix, weakest-link confidence)
- P4 `predictions.ts`, `negative.ts`, `gaps.ts` (four-condition test)
- P5 `hypotheses.ts`, `deception.ts`, `assumptions.ts` (null + deception always present)
- P6 `narrate.ts`, `lexicon.ts` (validator; **user reads this diff**)
- P7 `app/case/`, `app/api/case/route.ts`, `diff.ts`, Brand Watch wiring, export

## Named exports to introduce (no magic numbers)

`TIME_RUBRIC_VERSION`, tier tolerances (T1 ±0, T2 ±24h, T3 ±7d, T4 unbounded-lower),
`CLOCK_SKEW_TOLERANCE`, `GRADING_VERSION`, the Admiralty tables, default grade `F6`.

## Deferrals (NOTES.md candidates)

Passive-DNS history, WHOIS history, screenshot perceptual hashing, analyst-authored
hypotheses, multi-analyst collaboration.

## P0 deviation (disclosed)

Target-behavior tests are `it.todo` (pending), not red, so the auto-deploy `main`
suite stays green. Each names the phase that will replace it with a live assertion
that fails-first. The behaviours are captured executably; only their activation is
deferred to their owning phase.
