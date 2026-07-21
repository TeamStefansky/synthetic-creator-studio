// Clue index - links repeated entities across a user's checks. Stored per browser
// (localStorage), alongside the check history. Surfaces a plain "also appeared in
// N checks you did before" line - NO graph to operate, no entity browser.

import { listLocal } from "@/lib/check/history";
import { Entity, EntityKind, entityKey, entityLabel } from "./extract";

export interface ClueConnection {
  entity: Entity;
  label: string; // e.g. "IP 1.2.3.4"
  checks: { id: string; headline: string; type: string }[]; // earlier checks sharing it
}

const KEY = "tl:clueindex";

type Index = Record<string, string[]>; // entityKey -> [checkId...]

function load(): Index {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function save(idx: Index): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(idx));
}

/** Given a new check's entities, return connections to EARLIER checks (before
 * recording this one), then record this check's entities for the future. */
export function linkAndRecord(checkId: string, entities: Entity[]): ClueConnection[] {
  const idx = load();
  const history = listLocal();
  const byId = new Map(history.map((c) => [c.id, c]));

  const connections: ClueConnection[] = [];
  for (const e of entities) {
    const k = entityKey(e);
    const priorIds = (idx[k] || []).filter((id) => id !== checkId && byId.has(id));
    if (priorIds.length) {
      connections.push({
        entity: e,
        label: `${entityLabel[e.kind as EntityKind]} ${e.value}`,
        checks: priorIds.map((id) => {
          const c = byId.get(id)!;
          return { id, headline: c.headline, type: c.type };
        }),
      });
    }
    idx[k] = Array.from(new Set([...(idx[k] || []), checkId]));
  }
  save(idx);
  return connections;
}

/** Read-only: connections for an already-recorded check (used when reopening). */
export function connectionsFor(checkId: string, entities: Entity[]): ClueConnection[] {
  const idx = load();
  const history = listLocal();
  const byId = new Map(history.map((c) => [c.id, c]));
  const out: ClueConnection[] = [];
  for (const e of entities) {
    const priorIds = (idx[entityKey(e)] || []).filter((id) => id !== checkId && byId.has(id));
    if (priorIds.length) {
      out.push({
        entity: e, label: `${entityLabel[e.kind as EntityKind]} ${e.value}`,
        checks: priorIds.map((id) => { const c = byId.get(id)!; return { id, headline: c.headline, type: c.type }; }),
      });
    }
  }
  return out;
}
