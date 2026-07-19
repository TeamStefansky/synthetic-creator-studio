// scripts/refresh-fara.ts — OPERATOR-RUN reference refresh (NOT part of the app
// runtime or the build). Populates data/io-reference/foreign-agent-registries.json
// from an official foreign-agent registry export (e.g. US DOJ FARA eFile).
//
// Why operator-run: the tool ships neutral (empty reference). An operator who
// wants the "Registered foreign-agent nexus" lead populates it from an official,
// auditable public source and can inspect the diff before committing.
//
// HARD RULES honored:
//   • ORGANIZATIONS ONLY — records that look like individual persons are dropped
//     (rule 1: no named-individual attribution).
//   • Reproducible + polite — requests are throttled; every entry keeps its
//     official filingUrl provenance (rules 5 & 8).
//   • Never fake capability — there is NO fabricated default endpoint. You must
//     supply the official export URL you are authorized to read (rule 7).
//
// Usage:
//   FARA_SOURCE_URL="https://<official FARA export>.json" npx tsx scripts/refresh-fara.ts
//   add --write to persist (default is a dry run that only prints a summary)
//
// The official US registry portal is https://efile.fara.gov/ (see its data/
// bulk-export section for the current machine-readable URL). Point FARA_SOURCE_URL
// at that export. The script maps whatever records it receives onto our schema and
// refuses to write if the response shape is unrecognized.

import { promises as fs } from "fs";
import path from "path";

const OUT = path.join(process.cwd(), "data", "io-reference", "foreign-agent-registries.json");
const THROTTLE_MS = 1500;
const MAX_PAGES = 200; // safety cap

interface ForeignAgentEntry {
  org: string; domains?: string[]; registry?: string;
  registrationNo?: string; filingUrl?: string; date?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Heuristic: drop records that look like an individual person rather than an org.
// Conservative — when in doubt we EXCLUDE, because over-inclusion risks naming a
// person, which is prohibited.
const ORG_HINT = /\b(inc|llc|l\.l\.c|ltd|limited|corp|co\.|company|group|llp|plc|gmbh|ag|sa|s\.a|associates|partners|holdings|media|news|foundation|institute|council|committee|agency|bureau|ministry|embassy|consulate|network|services|solutions|consulting|communications|pac)\b/i;
function isLikelyOrg(name: string, explicitType?: string): boolean {
  if (explicitType && /individual|person/i.test(explicitType)) return false;
  if (explicitType && /organization|business|entity|firm|company/i.test(explicitType)) return true;
  if (ORG_HINT.test(name)) return true;
  // Two-token "First Last" with no org hint → treat as a person, exclude.
  const tokens = name.trim().split(/\s+/);
  return tokens.length !== 2;
}

function pick(rec: any, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = rec?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function normalizeDomain(input?: string): string {
  if (!input) return "";
  let s = input.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split("/")[0].split("?")[0].split("#")[0].split("@").pop()!.split(":")[0].replace(/^www\./, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : "";
}

function toEntry(rec: any): ForeignAgentEntry | null {
  const org = pick(rec, ["Registrant", "registrant", "org", "name", "Name", "registrant_name"]);
  if (!org) return null;
  const type = pick(rec, ["Registrant_Type", "type", "entity_type", "RegistrantType"]);
  if (!isLikelyOrg(org, type)) return null;
  const registrationNo = pick(rec, ["Registration_Number", "registration_number", "reg_no", "RegistrationNumber", "Registrant_Number"]);
  const filingUrl = pick(rec, ["url", "Url", "filing_url", "link"]);
  const date = pick(rec, ["Registration_Date", "registration_date", "date", "Effective_Date"]);
  const rawDomains = (rec?.domains || rec?.Domains || rec?.website || rec?.Website || "");
  const domains = (Array.isArray(rawDomains) ? rawDomains : String(rawDomains).split(/[,\s]+/))
    .map(normalizeDomain).filter(Boolean);
  return {
    org, registry: "FARA",
    registrationNo, filingUrl,
    date: date ? date.slice(0, 7) : undefined,
    domains: domains.length ? [...new Set(domains)] : undefined,
  };
}

function extractRecords(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const k of ["results", "data", "records", "items", "value"]) {
    if (Array.isArray(payload?.[k])) return payload[k];
  }
  return [];
}

async function main() {
  const write = process.argv.includes("--write");
  const base = process.env.FARA_SOURCE_URL || process.argv.find((a) => a.startsWith("--source="))?.slice(9);
  if (!base) {
    console.error("ERROR: no source. Set FARA_SOURCE_URL (or --source=) to the official FARA export URL you are authorized to read.");
    console.error("See https://efile.fara.gov/ for the current machine-readable export.");
    process.exit(2);
  }

  const all: any[] = [];
  // Best-effort pagination: try ?page=N until a page returns no records. Sources
  // that ignore the param return everything on page 1 and we stop after one page.
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = base.includes("?") ? `${base}&page=${page}` : `${base}?page=${page}`;
    const res = await fetch(page === 1 ? base : url, { headers: { Accept: "application/json" } });
    if (!res.ok) { console.error(`Fetch failed (page ${page}): HTTP ${res.status}`); break; }
    const recs = extractRecords(await res.json());
    if (!recs.length) break;
    all.push(...recs);
    if (page === 1 && recs.length && base === (base.includes("?") ? base : base)) {
      // If the source likely returned the full set on page 1, don't hammer it.
      // Heuristic: stop unless the URL explicitly opts into pagination.
      if (!base.includes("page=")) break;
    }
    await sleep(THROTTLE_MS);
  }

  if (!all.length) {
    console.error("No records parsed from the source — response shape unrecognized. Nothing written.");
    process.exit(1);
  }

  const entries: ForeignAgentEntry[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const rec of all) {
    const e = toEntry(rec);
    if (!e) { dropped++; continue; }
    const key = (e.registrationNo || e.org).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(e);
  }

  const out = {
    _comment: (JSON.parse(await fs.readFile(OUT, "utf8").catch(() => "{}"))._comment) ||
      "Foreign-agent registry reference — ORGANIZATIONS ONLY. Generated by scripts/refresh-fara.ts.",
    version: new Date().toISOString().slice(0, 10),
    source: base,
    generatedBy: "scripts/refresh-fara.ts",
    entries: entries.sort((a, b) => a.org.localeCompare(b.org)),
  };

  console.log(`Parsed ${all.length} records → ${entries.length} organization entries (dropped ${dropped} non-org/person or empty).`);
  if (!write) {
    console.log("DRY RUN — re-run with --write to persist to", path.relative(process.cwd(), OUT));
    console.log("Sample:", JSON.stringify(entries.slice(0, 3), null, 2));
    return;
  }
  await fs.writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log("Wrote", path.relative(process.cwd(), OUT));
}

main().catch((e) => { console.error(e); process.exit(1); });
