// Structured pluralism (layer 06 · P6). Team A / Team B: two independent analyses
// of the same ledger with different starting assumptions, neither able to see the
// other's interim reasoning (the section-C firewall) - the PRODUCT is the
// comparison, not a merged answer. Multiple-scenarios generation when evidence
// underdetermines. Argument mapping: a judgment whose warrant is unstated is
// flagged rather than published silently.

export const PLURALISM_VERSION = "pluralism-v1";

export interface TeamResult { verdict: string; reasons: string[] }

export interface TeamABResult {
  convergent: boolean;
  divergence: string;
  product: string; // the comparison IS the product
}

/** Compare two independently-produced analyses. Divergence localizes uncertainty. */
export function teamAB(a: TeamResult, b: TeamResult): TeamABResult {
  const convergent = a.verdict === b.verdict;
  return {
    convergent,
    divergence: convergent ? "" : `Team A: ${a.verdict} - Team B: ${b.verdict}`,
    product: convergent
      ? `Convergent (${a.verdict}) - earns confidence.`
      : `Divergent - the real uncertainty is localized here, not resolved: ${a.verdict} vs ${b.verdict}.`,
  };
}

export interface ArgumentMap {
  claim: string;
  premises: string[];
  warrant?: string;      // the reasoning connecting premises to claim
  objections: string[];
  unstatedWarrant: boolean;
}

/** A map with an empty warrant box is flagged - the error prose hides, a map shows. */
export function checkArgumentMap(m: Omit<ArgumentMap, "unstatedWarrant">): ArgumentMap {
  return { ...m, unstatedWarrant: !m.warrant || !m.warrant.trim() };
}

export interface Scenario { drivers: Record<string, string>; whatWouldBeTrue: string }

/** Vary the key drivers and emit what-would-have-to-be-true accounts. */
export function multipleScenarios(drivers: { name: string; values: string[] }[]): Scenario[] {
  let combos: Record<string, string>[] = [{}];
  for (const d of drivers) combos = combos.flatMap((c) => d.values.map((v) => ({ ...c, [d.name]: v })));
  return combos.map((drivers) => ({ drivers, whatWouldBeTrue: `Would require: ${Object.entries(drivers).map(([k, v]) => `${k}=${v}`).join(", ")}.` }));
}
