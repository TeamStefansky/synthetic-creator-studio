# IO reference data

Publicly-documented, **organization-only** reference sets used to surface
**corroboration leads — never verdicts** — in Brand Watch and the CIB analyzer:

| File | What it holds | Populate from |
|------|---------------|---------------|
| `state-media-domains.json` | Domains of publicly-documented state-affiliated media (orgs) | Platform state-media labels, peer-reviewed datasets |
| `documented-campaign-domains.json` | Domains named in **published, attributed** influence-op takedown reports | Platform CIB disclosures, EU DisinfoLab, Stanford IO, DFRLab |
| `foreign-agent-registries.json` | Orgs with a **lawful public** foreign-agent disclosure | Official registries (US FARA, etc.) |

## Non-negotiables (enforced in code + tests)

- **Ships EMPTY and neutral.** TruthLens bakes in no political judgments. Every
  file ships with `entries: []`; an empty reference renders as **Unknown /
  "Not collected"** — never a reassuring "clean".
- **Organizations only — never persons.** Do not add an individual under any file.
  `scripts/refresh-fara.ts` drops records that look like people.
- **Every entry is auditable.** Each entry carries a provenance URL
  (`source` / `report` / `filingUrl`). No provenance → don't add it.
- **A match is a lead, not a verdict.** The indicators that consume these files
  always render with a level, the matched evidence, and an explicit innocent
  alternative (syndication, legitimate citation, a lawful filing).
- **Weight 0 today.** In the current phase the two IO indicators are
  informational only — they do not move the combined threat score. Scoring weight
  (and the single `RUBRIC_VERSION` bump) land in the next phase so historical
  scores stay comparable.

See each file's `_comment` and `schema` for the exact entry shape.

## Refreshing the foreign-agent registry

`scripts/refresh-fara.ts` is **operator-run** — not part of the app runtime or
the build. It is throttled and defaults to a dry run.

```bash
# 1. Get the current machine-readable export URL from the official portal:
#    https://efile.fara.gov/   (there is NO fabricated default — you supply it)
# 2. Dry run (prints a summary, writes nothing):
FARA_SOURCE_URL="https://<official-fara-export>.json" npx tsx scripts/refresh-fara.ts
# 3. Persist once the summary looks right:
FARA_SOURCE_URL="https://<official-fara-export>.json" npx tsx scripts/refresh-fara.ts --write
```

The script maps records onto the schema, keeps organizations only, de-duplicates
by registration number, throttles requests (1.5s), and stamps the output with the
`source` URL and a date `version` for reproducibility. Review the diff before
committing.

`IO_REFERENCE_VERSION` in `lib/io-reference.ts` versions the reference contract;
bump it if the entry shapes change.
