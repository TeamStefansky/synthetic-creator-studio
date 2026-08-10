// Order of volatility + dual-tool verification (layer 06 · P5). Collect the
// most-perishable material FIRST - the world does not wait, and the planner's
// cost ranking would otherwise collect cheap-stable material first and lose the
// perishable evidence. Volatility is a HARD ordering constraint ABOVE diagnosticity,
// not a tiebreak. Dual-tool verification catches a stale/misconfigured instrument
// (distinct from blind verification, which controls the examiner): a load-bearing
// finding must reproduce with a second independent tool, and where two tools
// disagree, the disagreement IS the finding.

export const COLLECT_ORDER_VERSION = "collect-order-v1";

// Most perishable first.
export const VOLATILITY_ORDER = ["live_content", "dns", "platform_post", "ephemeral", "registry", "certificate", "archive"] as const;
export type VolatilityClass = (typeof VOLATILITY_ORDER)[number];

export function volatilityRank(kind: string): number {
  const i = (VOLATILITY_ORDER as readonly string[]).indexOf(kind);
  return i === -1 ? VOLATILITY_ORDER.length : i;
}

/** Sort by volatility (hard) first, then by diagnosticity (descending). */
export function orderByVolatility<T extends { volatility: string; diagnosticity: number }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => volatilityRank(a.volatility) - volatilityRank(b.volatility) || b.diagnosticity - a.diagnosticity);
}

export interface DualToolResult {
  agree: boolean;
  finding: string;
  valueA: string;
  valueB: string;
}

/** Two independent tools on one load-bearing finding. Disagreement is the finding. */
export function dualTool(toolA: string, toolB: string, valueA: string, valueB: string): DualToolResult {
  const agree = valueA.trim().toLowerCase() === valueB.trim().toLowerCase();
  return {
    agree,
    valueA, valueB,
    finding: agree
      ? `confirmed by ${toolA} and ${toolB}: ${valueA}`
      : `TOOLS DISAGREE (${toolA}=${valueA} vs ${toolB}=${valueB}) - the disagreement is the finding; the conclusion does not rest on either reading`,
  };
}
