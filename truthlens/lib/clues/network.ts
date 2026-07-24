// Build a NETWORK across all of a user's searches: an entity that appeared in
// two or more searches links those searches together. Nodes = searches (checks)
// + the shared entities (IP / domain / analytics ID / ASN / SSL SAN); edges join
// each search to the entities it shares with another search. Browser-local
// (reads the clue index + check history from localStorage).

import { listLocal } from "@/lib/check/history";
import { entityLabel, type EntityKind } from "./extract";
import type { OperatorNetwork } from "@/lib/types";

const KEY = "tl:clueindex";

// Map a clue EntityKind onto the operator-network node kinds NetworkGraph knows.
const KIND_MAP: Record<string, OperatorNetwork["nodes"][number]["kind"]> = {
  ip: "ip", asn: "ip", net_org: "ip",
  domain: "domain", ssl_san: "domain", email_domain: "domain",
  ga_id: "ga", adsense_id: "adsense", account: "account",
};

export interface SearchNetwork extends OperatorNetwork {
  searchCount: number;   // distinct searches that participate
  linkCount: number;     // shared entities linking >=2 searches
}

export function buildSearchNetwork(): SearchNetwork {
  const empty: SearchNetwork = { nodes: [], edges: [], searchCount: 0, linkCount: 0 };
  if (typeof window === "undefined") return empty;

  let idx: Record<string, string[]> = {};
  try { idx = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return empty; }
  const byId = new Map(listLocal().map((c) => [c.id, c]));

  const nodes = new Map<string, OperatorNetwork["nodes"][number]>();
  const edges: OperatorNetwork["edges"] = [];
  const searches = new Set<string>();
  let linkCount = 0;

  for (const [ek, rawIds] of Object.entries(idx)) {
    const ids = [...new Set(rawIds)].filter((id) => byId.has(id));
    if (ids.length < 2) continue; // an entity only makes a LINK if 2+ searches share it
    linkCount++;

    const ci = ek.indexOf(":");
    const kind = ci >= 0 ? ek.slice(0, ci) : ek;
    const value = ci >= 0 ? ek.slice(ci + 1) : "";
    const eid = `ent:${ek}`;
    nodes.set(eid, { id: eid, label: `${entityLabel[kind as EntityKind] || kind}: ${value}`, kind: KIND_MAP[kind] || "domain" });

    for (const id of ids) {
      const c = byId.get(id)!;
      const cid = `chk:${id}`;
      if (!nodes.has(cid)) nodes.set(cid, { id: cid, label: c.headline || c.input || id, kind: "target" });
      searches.add(cid);
      edges.push({ source: cid, target: eid, reason: `shared ${entityLabel[kind as EntityKind] || kind}` });
    }
  }

  return { nodes: [...nodes.values()], edges, searchCount: searches.size, linkCount };
}
