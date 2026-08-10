// Evidence corroboration overlay (layer 07) - turns a calibrated Link Board result
// into a *defensible* one. It answers the questions the base rubric can reason about
// but not measure, and that a careful analyst asks before calling an overlap a "link":
//
//   1. Prevalence - how many sites in the WORLD carry this exact id? (reverse-lookup)
//   2. Recency    - is the shared id a deprecated UA- tag (weaker) or a current one?
//   3. Null model - how likely is this overlap by pure chance? (analytic control)
//   4. Coverage   - what wasn't scanned, where the strongest link evidence lives?
//
// It is ADDITIVE and DOWN-ONLY: it never raises a base strength, only caps it when
// corroboration is missing or refuting. Its own version stamp keeps it interpretable
// independently of the base rubric. Frozen rules honored: unmeasured prevalence is
// Unknown (never assumed unique); the innocent alternative always leads; people and
// funding are pointed to official public records only, never inferred here.

import type { ConfidenceLevel } from "@/components/ConfidenceBadge";
import { CHARACTERISTIC, isIndividualCharacteristic } from "./calibrate";
import { isReverseLookupable, measurePrevalence, prevalenceProvidersConnected } from "./prevalence";
import type { PrevalenceResult } from "./prevalence";
import { classifyGaId } from "@/lib/trackers";
import type { ArtifactCorroboration, BoardResult, Corroboration, OverlapItem } from "./types";

export const CORROBORATION_VERSION = "corroboration-v1";

const ORDER: Record<ConfidenceLevel, number> = { Unknown: -1, Low: 0, Medium: 1, High: 2 };
function minStrength(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  return ORDER[a] <= ORDER[b] ? a : b;
}

/**
 * Down-only effective strength for one shared id given its measured prevalence and
 * recency. Pure and exported for testing.
 */
export function applyCorroboration(
  base: ConfidenceLevel,
  prevalence: PrevalenceResult,
  deprecated: boolean,
): { effective: ConfidenceLevel; notes: string[] } {
  const notes: string[] = [];
  let cap: ConfidenceLevel = "High";

  switch (prevalence.band) {
    case "ubiquitous":
      cap = "Low";
      notes.push(
        `Shared by ${prevalence.count} sites worldwide - this is an agency/template deployment, ` +
          `not a link between these two. The overlap is near-meaningless.`,
      );
      break;
    case "many":
      cap = "Low";
      notes.push(`Shared by ${prevalence.count} sites worldwide - too common to corroborate a link.`);
      break;
    case "few":
      cap = "Medium";
      notes.push(`Shared by only ${prevalence.count} sites worldwide - corroborating, but not conclusive.`);
      break;
    case "unique-pair":
      cap = "High";
      notes.push(`Carried by only the compared sites - the strongest possible corroboration for this id.`);
      break;
    case "unknown":
    default:
      cap = "Medium";
      notes.push(
        `Worldwide prevalence not measured - cannot claim a High-confidence link on a shared id ` +
          `without knowing how many other sites carry it. Treated as uncorroborated.`,
      );
      break;
  }

  if (deprecated) {
    cap = minStrength(cap, "Medium");
    notes.push(
      `The shared id is a deprecated Universal Analytics (UA-) tag (Google sunset UA on 1 Jul 2023); ` +
        `a live UA tag is stale and corroborates less than a current GA4/GTM overlap.`,
    );
  }

  return { effective: minStrength(base, cap), notes };
}

// Deduplicate the distinctive shared overlaps across every edge (one entry per id).
function distinctiveOverlaps(result: BoardResult): OverlapItem[] {
  const seen = new Map<string, OverlapItem>();
  for (const edge of result.edges) {
    for (const it of edge.items) {
      if (!it.countsToward) continue;
      if (!isIndividualCharacteristic(it.kind)) continue;
      const k = `${it.kind}|${it.value}`;
      if (!seen.has(k)) seen.set(k, it);
    }
  }
  return [...seen.values()];
}

function significanceText(p: number | null, n: number): string {
  if (n === 0 || p == null) return "No distinctive shared ids to test against chance.";
  if (p <= 1e-6) return `≈1 in ${Math.round(1 / p).toLocaleString()} by chance - far beyond coincidence.`;
  if (p <= 1e-3) return `≈1 in ${Math.round(1 / p).toLocaleString()} by chance - unlikely to be coincidental.`;
  if (p <= 5e-2) return `≈1 in ${Math.round(1 / p).toLocaleString()} by chance - modestly above coincidence.`;
  return `≈${(p * 100).toFixed(0)}% expected by chance - consistent with coincidence.`;
}

const NULL_HYPOTHESIS = {
  ifLinked:
    "If the two sites were built or run by the same operator, we would expect at least one " +
    "account-scoped shared id (GA4/GTM/Pixel/AdSense) carried by only these sites, or a shared " +
    "non-generic certificate / mail host / nameserver, or a shared registrant in historical WHOIS.",
  ifUnrelated:
    "If the two sites were unrelated, we would still expect them to share commodity infrastructure " +
    "(Cloudflare, a popular registrar, nginx, WordPress) and possibly an agency-wide tracker id - " +
    "none of which distinguishes a link from coincidence.",
};

const NOT_SCANNED = [
  {
    area: "Social platforms (Telegram, X/Twitter, Meta)",
    why:
      "Shared admins, cross-posting and coordinated amplification usually live here - often the " +
      "strongest link signal. Reachable only via official platform APIs; never scraped.",
    where: "Brand Watch · SIGNAL Grid (when official platform API keys are connected)",
  },
  {
    area: "Organizational filings & funding",
    why:
      "Shared officers, board members or funders outweigh any shared server. Available only from " +
      "official public records, cited, at the organization level - never inferred here, never a graph node.",
    where: "Sanctions Screening · Nonprofit Registry (990 / registry filings) · foreign-agent registries",
  },
  {
    area: "Historical domain registration & passive DNS",
    why:
      "A shared registrant email/org in historical WHOIS, or a shared non-generic MX/nameserver, is a " +
      "much stronger link than a shared CDN IP. Requires SecurityTrails / DomainTools / WhoisXML.",
    where: "connect a historical-WHOIS / passive-DNS provider key",
  },
];

/**
 * Build the corroboration overlay for a board result. `measure` is injectable so
 * tests supply deterministic prevalence without network. Never throws.
 */
export async function buildCorroboration(
  result: BoardResult,
  opts: { measure?: (kind: string, value: string) => Promise<PrevalenceResult> } = {},
): Promise<Corroboration> {
  const measure = opts.measure ?? measurePrevalence;
  const providers = prevalenceProvidersConnected();
  const distinctive = distinctiveOverlaps(result);

  // Analytic null baseline from the rubric's own per-artifact base rates.
  const pByChance = distinctive.length
    ? distinctive.reduce((p, it) => p * (CHARACTERISTIC[it.kind]?.baseRate ?? 1), 1)
    : null;

  // Prevalence + recency only apply to reverse-lookupable (account-scoped) ids.
  const lookupable = distinctive.filter((it) => isReverseLookupable(it.kind));
  const artifacts: ArtifactCorroboration[] = [];
  for (const it of lookupable) {
    const prevalence = await measure(it.kind, it.value).catch(
      (): PrevalenceResult => ({ connected: false, count: null, band: "unknown", note: "measurement failed" }),
    );
    const dep = it.kind === "ga_id" ? classifyGaId(it.value) : { deprecated: false, note: "" };
    const { effective, notes } = applyCorroboration(it.strength, prevalence, dep.deprecated);
    if (dep.deprecated && dep.note) notes.push(dep.note);
    artifacts.push({
      kind: it.kind,
      value: it.value,
      display: it.display,
      baseStrength: it.strength,
      effectiveStrength: effective,
      prevalence,
      deprecated: dep.deprecated ? dep.note : undefined,
      baseRateByChance: CHARACTERISTIC[it.kind]?.baseRate ?? 0,
      notes,
    });
  }

  const capped = artifacts.filter((a) => ORDER[a.effectiveStrength] < ORDER[a.baseStrength]).length;
  const summary =
    distinctive.length === 0
      ? "No account-scoped shared ids were found among the compared sites. Infrastructure overlap alone caps at 'common operation' - the strongest link evidence would come from the areas not scanned below."
      : providers.length === 0
        ? `${lookupable.length} account-scoped shared id(s) found, but reverse-lookup is not connected - their worldwide prevalence is unmeasured, so none can be called a High-confidence link yet. ${capped} were capped pending prevalence.`
        : `${lookupable.length} account-scoped shared id(s) measured against worldwide prevalence; ${capped} were down-tiered as too common or unmeasured.`;

  return {
    version: CORROBORATION_VERSION,
    prevalenceConnected: providers.length > 0,
    providers,
    artifacts,
    nullHypothesis: NULL_HYPOTHESIS,
    control: {
      distinctiveOverlapCount: distinctive.length,
      probabilityByChance: pByChance,
      significance: significanceText(pByChance, distinctive.length),
      note:
        "Analytic null baseline from the rubric's per-artifact base rates (P two unrelated sites share " +
        "each distinctive artifact). A live known-unrelated control group can be added once reverse-lookup " +
        "providers are connected.",
    },
    notScanned: NOT_SCANNED,
    summary,
  };
}
