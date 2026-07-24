// OpenSanctions screening - checks a name/organization against consolidated
// PUBLIC sanctions & watchlists (OFAC SDN, EU, UN, UK HMT, ...). This is lawful
// disclosure of public government designations, cited to the source dataset -
// NOT profiling of a private individual (CLAUDE.md: registry hits are
// transparency context). Key-gated: without OPENSANCTIONS_API_KEY it reports
// connected:false ("not connected"), never a simulated result (rule 7).
//
// Ported idea from OSIRIS (github.com/simplifaisoul/osiris, MIT); implemented
// natively against the official api.opensanctions.org search endpoint.

import { getJson } from "./http";
import { cacheGet, cacheSet } from "./cache";

export interface SanctionHit {
  id: string;
  caption: string;              // display name of the designated entity
  schema: string;               // "Person" | "Organization" | "Company" | ...
  datasets: string[];           // e.g. ["us_ofac_sdn", "eu_fsf"]
  countries: string[];
  topics: string[];             // e.g. ["sanction", "role.pep"]
  score: number | null;         // match score 0-1 when provided
  url: string;                  // public OpenSanctions entity page (citation)
}

export interface SanctionScreen {
  connected: boolean;
  query: string;
  hits: SanctionHit[];
  reason?: string;
}

const CACHE_MS = 12 * 3600_000;

export async function screenSanctions(query: string): Promise<SanctionScreen> {
  const q = (query || "").trim();
  const key = process.env.OPENSANCTIONS_API_KEY?.trim();
  if (q.length < 2) return { connected: !!key, query: q, hits: [], reason: "Enter a name (2+ characters)." };
  if (!key) {
    return { connected: false, query: q, hits: [],
      reason: "Set OPENSANCTIONS_API_KEY (free tier at opensanctions.org/api) to enable sanctions screening." };
  }

  const ck = `opensanctions:${q.toLowerCase()}`;
  const cached = await cacheGet<SanctionScreen>(ck, CACHE_MS);
  if (cached) return cached;

  const data = await getJson<any>(
    `https://api.opensanctions.org/search/default?q=${encodeURIComponent(q)}&limit=10`,
    { timeoutMs: 12000, headers: { Authorization: `ApiKey ${key}`, Accept: "application/json" } },
  );
  const hits: SanctionHit[] = (data?.results || []).map((r: any): SanctionHit => {
    const props = r?.properties || {};
    return {
      id: String(r?.id || ""),
      caption: r?.caption || r?.id || "(unnamed)",
      schema: r?.schema || "Entity",
      datasets: Array.isArray(r?.datasets) ? r.datasets : [],
      countries: Array.isArray(props.country) ? props.country : [],
      topics: Array.isArray(props.topics) ? props.topics : [],
      score: typeof r?.score === "number" ? r.score : null,
      url: r?.id ? `https://www.opensanctions.org/entities/${r.id}/` : "https://www.opensanctions.org/",
    };
  });

  const out: SanctionScreen = { connected: true, query: q, hits };
  await cacheSet(ck, out);
  return out;
}
