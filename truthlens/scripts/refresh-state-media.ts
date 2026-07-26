// scripts/refresh-state-media.ts — OPERATOR-RUN reference refresh (NOT part of the
// app runtime or the build). Populates data/io-reference/state-media-domains.json
// from an auditable public dataset of state-controlled / state-affiliated media.
//
// Why operator-run: the tool ships with a small, EU-cited seed. An operator who
// wants broader coverage populates it from an official, auditable public source
// (e.g. an EU/EEAS designation export, a platform state-media-label dataset, or a
// peer-reviewed dataset) and can inspect the diff before committing.
//
// HARD RULES honored:
//   • ORGANIZATIONS / DOMAINS ONLY — never persons (rule 1).
//   • Every entry MUST carry a `source` provenance URL; records without one are
//     DROPPED (rules 7 & 8 — auditable, never faked).
//   • Never fake capability — there is NO fabricated default endpoint. You supply
//     the official export URL you are authorized to read.
//
// Usage:
//   STATE_MEDIA_SOURCE_URL="https://<official/auditable export>.json" npx tsx scripts/refresh-state-media.ts
//   add --write to persist (default is a dry run that only prints a summary)
//   add --merge to union with the existing seed instead of replacing it
//
// Expected record shape (flexible field names): a domain, a label, and a source
// URL. Records missing a domain or a source are dropped.

import { promises as fs } from "fs";
import path from "path";

const OUT = path.join(process.cwd(), "data", "io-reference", "state-media-domains.json");
const THROTTLE_MS = 1500;
const MAX_PAGES = 200;

interface StateMediaEntry { domain: string; label?: string; source: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pick(rec: any, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = rec?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function normalizeDomain(input?: string): string {
  if (!input) return "";
  let s = input.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split("/")[0].split("?")[0].split("#")[0].split("@").pop()!.split(":")[0].replace(/^www\./, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : "";
}

// Conservative person guard: a label that looks like a bare "First Last" is dropped.
const ORG_HINT = /\b(rt|tv|news|media|press|agency|network|times|gazeta|daily|radio|broadcast|channel|post|journal|novosti|global|voice|group|holding|corp|inc|ltd|gmbh|sa|ag)\b/i;
function labelIsOrgLike(label?: string): boolean {
  if (!label) return true; // no label → keep (domain-only entry is fine)
  if (ORG_HINT.test(label)) return true;
  return label.trim().split(/\s+/).length !== 2;
}

function toEntry(rec: any): StateMediaEntry | null {
  const domain = normalizeDomain(pick(rec, ["domain", "Domain", "url", "URL", "website", "site", "host"]));
  if (!domain) return null;
  const source = pick(rec, ["source", "Source", "provenance", "reference", "citation", "url_source", "sourceUrl"]);
  if (!source || !/^https?:\/\//i.test(source)) return null; // no citation → drop (never faked)
  const label = pick(rec, ["label", "Label", "org", "organization", "name", "outlet"]);
  if (!labelIsOrgLike(label)) return null;
  return { domain, label, source };
}

function extractRecords(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const k of ["entries", "results", "data", "records", "items", "value"]) {
    if (Array.isArray(payload?.[k])) return payload[k];
  }
  return [];
}

async function main() {
  const write = process.argv.includes("--write");
  const merge = process.argv.includes("--merge");
  const base = process.env.STATE_MEDIA_SOURCE_URL || process.argv.find((a) => a.startsWith("--source="))?.slice(9);
  if (!base) {
    console.error("ERROR: no source. Set STATE_MEDIA_SOURCE_URL (or --source=) to an auditable public dataset URL you are authorized to read.");
    console.error("Every record must carry a source/provenance URL; records without one are dropped.");
    process.exit(2);
  }

  const all: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = base.includes("?") ? `${base}&page=${page}` : `${base}?page=${page}`;
    const res = await fetch(page === 1 ? base : url, { headers: { Accept: "application/json" } });
    if (!res.ok) { console.error(`Fetch failed (page ${page}): HTTP ${res.status}`); break; }
    const recs = extractRecords(await res.json());
    if (!recs.length) break;
    all.push(...recs);
    if (page === 1 && !base.includes("page=")) break;
    await sleep(THROTTLE_MS);
  }

  if (!all.length) { console.error("No records parsed — response shape unrecognized. Nothing written."); process.exit(1); }

  const map = new Map<string, StateMediaEntry>();
  if (merge) {
    const existing = JSON.parse(await fs.readFile(OUT, "utf8").catch(() => "{}"));
    for (const e of (existing.entries || [])) if (e?.domain) map.set(e.domain, e);
  }
  let dropped = 0;
  for (const rec of all) {
    const e = toEntry(rec);
    if (!e) { dropped++; continue; }
    map.set(e.domain, e);
  }

  const existing = JSON.parse(await fs.readFile(OUT, "utf8").catch(() => "{}"));
  const out = {
    _comment: existing._comment || "State-media reference — ORGANIZATIONS/DOMAINS ONLY, every entry cited.",
    version: new Date().toISOString().slice(0, 10),
    schema: existing.schema,
    source: base,
    generatedBy: "scripts/refresh-state-media.ts",
    entries: [...map.values()].sort((a, b) => a.domain.localeCompare(b.domain)),
  };

  console.log(`Parsed ${all.length} records → ${out.entries.length} cited domain entries (dropped ${dropped} without a domain+source or person-like).`);
  if (!write) {
    console.log("DRY RUN — re-run with --write to persist to", path.relative(process.cwd(), OUT));
    console.log("Sample:", JSON.stringify(out.entries.slice(0, 3), null, 2));
    return;
  }
  await fs.writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log("Wrote", path.relative(process.cwd(), OUT));
}

main().catch((e) => { console.error(e); process.exit(1); });
