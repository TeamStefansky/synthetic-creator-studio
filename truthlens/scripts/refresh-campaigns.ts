// scripts/refresh-campaigns.ts — OPERATOR-RUN reference refresh (NOT part of the
// app runtime or the build). Populates data/io-reference/documented-campaign-domains.json
// from a PUBLISHED, ATTRIBUTED influence-operation takedown report or dataset
// (e.g. platform CIB disclosures, EU DisinfoLab, Stanford Internet Observatory,
// DFRLab, Meta adversarial-threat reports).
//
// Why operator-run: the tool ships neutral here (no baked-in campaign judgments).
// An operator populates the list from a published report and inspects the diff.
//
// HARD RULES honored:
//   • DOMAINS / INFRASTRUCTURE ONLY — never persons (rule 1).
//   • Every entry MUST carry `disclosedBy` (the publisher) and a `report` URL;
//     records without both are DROPPED (rules 7 & 8 — auditable, never faked).
//   • Never fake capability — NO fabricated default endpoint; supply the report's
//     machine-readable domain list URL you are authorized to read. A domain once
//     named in a report can later be dormant/reassigned: overlap is a LEAD, not proof.
//
// Usage:
//   CAMPAIGN_SOURCE_URL="https://<published dataset>.json" CAMPAIGN_DISCLOSED_BY="EU DisinfoLab" \
//   CAMPAIGN_REPORT_URL="https://<report>" CAMPAIGN_NAME="Doppelganger" npx tsx scripts/refresh-campaigns.ts
//   add --write to persist (default is a dry run); add --merge to union with existing.
//
// The per-run env vars supply the provenance applied to every record that does not
// already carry its own disclosedBy/report fields.

import { promises as fs } from "fs";
import path from "path";

const OUT = path.join(process.cwd(), "data", "io-reference", "documented-campaign-domains.json");
const THROTTLE_MS = 1500;
const MAX_PAGES = 200;

interface CampaignEntry { domain: string; campaign?: string; disclosedBy?: string; report?: string; date?: string }

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

function extractRecords(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const k of ["entries", "results", "data", "records", "items", "domains", "value"]) {
    if (Array.isArray(payload?.[k])) return payload[k];
  }
  return [];
}

async function main() {
  const write = process.argv.includes("--write");
  const merge = process.argv.includes("--merge");
  const base = process.env.CAMPAIGN_SOURCE_URL || process.argv.find((a) => a.startsWith("--source="))?.slice(9);
  const disclosedBy = process.env.CAMPAIGN_DISCLOSED_BY;
  const reportUrl = process.env.CAMPAIGN_REPORT_URL;
  const campaign = process.env.CAMPAIGN_NAME;
  if (!base) {
    console.error("ERROR: no source. Set CAMPAIGN_SOURCE_URL (or --source=) to the published dataset URL you are authorized to read.");
    process.exit(2);
  }
  if (!disclosedBy || !reportUrl || !/^https?:\/\//i.test(reportUrl)) {
    console.error("ERROR: provenance required. Set CAMPAIGN_DISCLOSED_BY and CAMPAIGN_REPORT_URL (an https report URL). Entries without both are dropped.");
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

  const map = new Map<string, CampaignEntry>();
  if (merge) {
    const existing = JSON.parse(await fs.readFile(OUT, "utf8").catch(() => "{}"));
    for (const e of (existing.entries || [])) if (e?.domain) map.set(e.domain, e);
  }
  let dropped = 0;
  for (const rec of all) {
    const raw = typeof rec === "string" ? { domain: rec } : rec;
    const domain = normalizeDomain(pick(raw, ["domain", "Domain", "url", "host", "site"]) || (typeof rec === "string" ? rec : ""));
    if (!domain) { dropped++; continue; }
    const rDisclosedBy = pick(raw, ["disclosedBy", "publisher", "source_org"]) || disclosedBy;
    const rReport = pick(raw, ["report", "reportUrl", "url_source", "citation"]) || reportUrl;
    if (!rDisclosedBy || !rReport || !/^https?:\/\//i.test(rReport)) { dropped++; continue; }
    map.set(domain, {
      domain,
      campaign: pick(raw, ["campaign", "operation", "name"]) || campaign,
      disclosedBy: rDisclosedBy,
      report: rReport,
      date: (pick(raw, ["date", "published"]) || "").slice(0, 7) || undefined,
    });
  }

  const existing = JSON.parse(await fs.readFile(OUT, "utf8").catch(() => "{}"));
  const out = {
    _comment: existing._comment || "Documented-campaign reference — DOMAINS ONLY, every entry cites disclosedBy + report.",
    version: new Date().toISOString().slice(0, 10),
    schema: existing.schema,
    source: base,
    generatedBy: "scripts/refresh-campaigns.ts",
    entries: [...map.values()].sort((a, b) => a.domain.localeCompare(b.domain)),
  };

  console.log(`Parsed ${all.length} records → ${out.entries.length} cited campaign-domain entries (dropped ${dropped} without a domain+provenance).`);
  if (!write) {
    console.log("DRY RUN — re-run with --write to persist to", path.relative(process.cwd(), OUT));
    console.log("Sample:", JSON.stringify(out.entries.slice(0, 3), null, 2));
    return;
  }
  await fs.writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log("Wrote", path.relative(process.cwd(), OUT));
}

main().catch((e) => { console.error(e); process.exit(1); });
