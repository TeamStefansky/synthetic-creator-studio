// Where a saved search reopens. /check can only restore its own check types;
// every other tool reopens on its own page, pre-filled from the saved input.
// One map for History, the /check "connected checks" list, and anything else
// that links back to a recorded search.

import type { CheckType } from "@/lib/check/detect";

const CHECK_TYPES: ReadonlySet<string> = new Set<CheckType>(["site", "post", "logs", "email", "narrative", "cib", "social"]);

/** tool type → [route, query parameter carrying the saved input] */
const TOOL_REOPEN: Record<string, [string, string | null]> = {
  osint: ["/tools/osint", "q"],
  sanctions: ["/tools/sanctions", "q"],
  crypto: ["/tools/crypto", "address"],
  mentions: ["/tools/mentions", "entity"],
  signal: ["/tools/signal", "entity"],
  origin: ["/tools/origin", "domain"],
  "origin-map": ["/tools/origin-map", null],
  linkboard: ["/tools/linkboard", "domains"],
};

export function reopenHref(rec: { id: string; type: string; input?: string }): string {
  if (CHECK_TYPES.has(rec.type)) return `/check?reopen=${encodeURIComponent(rec.id)}`;
  const t = TOOL_REOPEN[rec.type];
  if (!t) return `/check?reopen=${encodeURIComponent(rec.id)}`;
  const [route, param] = t;
  return param && rec.input ? `${route}?${param}=${encodeURIComponent(rec.input)}` : route;
}
