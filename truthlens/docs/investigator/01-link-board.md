# 01 — Link Board (as-built in this repo)

This layer is **already implemented** in TruthLens (not a placeholder). Layers 03–06 consume the
modules and version stamps below directly. Do not reimplement — extend.

## What exists

- `lib/board/types.ts`
  - `BoardArtifactKind` + `ALL_BOARD_ARTIFACT_KINDS` — the artifact taxonomy compared per pair.
  - `Tier = "strong" | "calibrated" | "weak"`, `Artifact`, `Fingerprint`, `OverlapItem`, `PairEdge`,
    `BoardNetwork`, `BoardResult`.
- `lib/board/calibrate.ts`
  - `BOARD_RUBRIC_VERSION = "board-overlap-v1"` — **the strength-rubric version stamp** later layers
    record on every artifact they derive.
  - `SHARED_IP_THRESHOLD`, `CALIBRATION` (per-artifact tier / label / calibration / alternative),
    `CalibrationCtx` (carries `cdn`, wildcard/CDN-cert flags), `calibrateOverlap`, `combineStrength`,
    `buildPairEdge`.
  - CDN / mass-host down-weighting: `COMMON_THIRD_PARTY`, `isMassHostOrg`, and `ctx.cdn` handling —
    a CDN / mass-host artifact renders **informational**, never a link.
- `lib/board/links.ts`
  - `collectFingerprint(domain)`, `compareFingerprints(fps)`, `buildLinkNetwork(fps)`,
    `runBoard(domains)`, plus Open PageRank authority enrichment.
- Cross-search layer (added later): `lib/clues/*` (`extract`, `index`, `network`, `record`,
  `findings`) accumulates the same artifact classes across every tool run and synthesises
  leads / clusters — the Case Board. Layer 03 supersedes `findings.ts` with the evidence ledger.

## Invariants this layer already enforces (never weaken)

- Every edge carries **evidence + a type-specific alternative** (`CALIBRATION[kind].alternative`).
- Common-by-default facts (nginx, WordPress, Cloudflare, shared-CDN certs) **never draw an edge**.
- Nodes are **domains / infrastructure, never people**.
- Overlap strength is banded (`High | Medium | Low | Unknown`), never a verdict; combination via
  `combineStrength` — the weakest-link / class-characteristic discipline layer 03 formalises.

## What layer 03+ adds on top

Layer 03 wraps these pairwise, calibrated artifacts in an **evidence ledger** (custody, content
hash, time tier, source grade) and reclassifies each shared artifact as a class or individual
characteristic (layer 06), feeding ACH, sequencing, and reconstruction. Record
`BOARD_RUBRIC_VERSION` on every derived artifact.
