// Shared evidence store (server-side, KV-backed) — the narrative-amplifier
// registry that lets the INFRA tools ask "does this domain also amplify a
// narrative we monitor?". The browser-local clue index (lib/clues/index.ts)
// stays as the anonymous-user complement; this is its server-side analogue for
// the one fact the browser can't hold: which domains amplify which monitored
// narratives (Brand Watch runs server-side).
//
// HARD RULES: domains/organizations/infrastructure only — never a person. Gated on
// storeAvailable(): without KV it is an honest no-op ("not connected"), never faked.
// A registry hit is a LEAD (co-hosting/syndication is context), never proof.

import { storeAvailable, kvGetJson, kvSetJson } from "@/lib/store";
import { normalizeDomain } from "@/lib/io-reference";

export const EVIDENCE_STORE_VERSION = "evidence-store-v1";

const KEY = "tl:amplifiers";
const MAX_DOMAINS = 5000;        // evict oldest by lastSeen beyond this
const MAX_ENTITIES_PER_DOMAIN = 12;

export interface AmplifierRecord {
  entities: string[];   // monitored narrative/brand terms this domain amplified
  firstSeen: string;    // ISO
  lastSeen: string;     // ISO
}
type Registry = { version: string; domains: Record<string, AmplifierRecord> };

async function load(): Promise<Registry> {
  const r = await kvGetJson<Registry>(KEY);
  return r && r.domains ? r : { version: EVIDENCE_STORE_VERSION, domains: {} };
}

/**
 * Record that `entity`'s narrative was amplified by these domains. Server-side,
 * append-merge, capped. No-op without KV. `nowIso` is injected for reproducibility.
 */
export async function recordAmplifiers(entity: string, domains: string[], nowIso: string): Promise<void> {
  if (!storeAvailable()) return;
  const clean = [...new Set(domains.map((d) => normalizeDomain(d)).filter(Boolean))];
  if (!clean.length || !entity.trim()) return;

  const reg = await load();
  for (const d of clean) {
    const rec = reg.domains[d] || { entities: [], firstSeen: nowIso, lastSeen: nowIso };
    if (!rec.entities.includes(entity)) rec.entities = [entity, ...rec.entities].slice(0, MAX_ENTITIES_PER_DOMAIN);
    rec.lastSeen = nowIso;
    reg.domains[d] = rec;
  }

  // Bound registry size: keep the most-recently-seen domains.
  const keys = Object.keys(reg.domains);
  if (keys.length > MAX_DOMAINS) {
    const keep = keys
      .sort((a, b) => (reg.domains[b].lastSeen).localeCompare(reg.domains[a].lastSeen))
      .slice(0, MAX_DOMAINS);
    const trimmed: Registry["domains"] = {};
    for (const k of keep) trimmed[k] = reg.domains[k];
    reg.domains = trimmed;
  }

  await kvSetJson(KEY, reg);
}

/** Look up which of these domains amplify a monitored narrative. {} without KV. */
export async function lookupAmplifiers(domains: string[]): Promise<{ connected: boolean; hits: Record<string, AmplifierRecord> }> {
  if (!storeAvailable()) return { connected: false, hits: {} };
  const reg = await load();
  const hits: Record<string, AmplifierRecord> = {};
  for (const raw of domains) {
    const d = normalizeDomain(raw);
    if (d && reg.domains[d]) hits[d] = reg.domains[d];
  }
  return { connected: true, hits };
}
