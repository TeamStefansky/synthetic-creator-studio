// Stability gating (layer 04 · P2). A new link must hold before it alerts, an
// element that oscillates is marked unstable and suppressed, and a case that will
// not sit still is flagged volatile (and its narrative is not regenerated each
// run). All thresholds are named exports. Pure + deterministic; the actual alert
// suppression is routed through the existing Brand Watch flapping layer.

export const STABILITY_VERSION = "case-stability-v1";
export const EDGE_CONFIRMATION_RUNS = 2;  // a new Moderate+ edge must hold this many consecutive runs
export const STABILITY_HOLD_RUNS = 3;     // an unstable element must hold this long before alerting again
export const CHURN_CEILING = 0.5;         // case churn above this => volatile

// Edges derived from inherently stable T1 artifacts do not flicker and alert on
// first observation - delaying them costs the analyst time for nothing.
export const T1_STABLE_KINDS: ReadonlySet<string> = new Set(["ga_id", "adsense_id", "domain_created", "ssl_san", "ct_log", "favicon_hash"]);

/** Presence of an element across consecutive runs, oldest -> newest. */
export type PresenceHistory = boolean[];

/** Number of appear/disappear transitions in the history. */
export function oscillationCount(h: PresenceHistory): number {
  let n = 0;
  for (let i = 1; i < h.length; i++) if (h[i] !== h[i - 1]) n++;
  return n;
}

/** An element that has flipped 2+ times is unstable. */
export function isUnstable(h: PresenceHistory): boolean {
  return oscillationCount(h) >= 2;
}

/** Present across the last EDGE_CONFIRMATION_RUNS runs (or first-seen if T1-stable). */
export function isConfirmed(h: PresenceHistory, t1Stable = false): boolean {
  if (!h.length || !h[h.length - 1]) return false; // must be present now
  if (t1Stable) return true;                        // T1 artifact - confirm on first observation
  const tail = h.slice(-EDGE_CONFIRMATION_RUNS);
  return tail.length >= EDGE_CONFIRMATION_RUNS && tail.every(Boolean);
}

/**
 * Whether a newly-observed edge should alert this run: it must be confirmed and
 * NOT unstable, and not already alerted. Flapping elements never satisfy this, so
 * they alert at most once (in practice zero) and are surfaced as unstable instead.
 */
export function shouldAlertEdge(h: PresenceHistory, opts: { t1Stable?: boolean; alreadyAlerted?: boolean } = {}): boolean {
  if (opts.alreadyAlerted) return false;
  if (isUnstable(h) && !opts.t1Stable) return false;
  return isConfirmed(h, opts.t1Stable);
}

/** Case churn: mean transition rate across all tracked elements. */
export function churnRate(histories: PresenceHistory[]): number {
  const usable = histories.filter((h) => h.length >= 2);
  if (!usable.length) return 0;
  const rate = usable.map((h) => oscillationCount(h) / (h.length - 1));
  return rate.reduce((a, b) => a + b, 0) / rate.length;
}

export function isVolatile(histories: PresenceHistory[]): boolean {
  return churnRate(histories) > CHURN_CEILING;
}

// ---- Dismissals: analyst marks a change a false positive ---------------------
// Fingerprinted, revocable, and recorded - a dismissal is a finding about the
// system, visible in the audit trail, never a silent mute.

export interface Dismissal {
  caseId: string;
  changeKind: string;
  subjectKey: string;
  reason: string;
  at: string;
  revoked?: boolean;
}

export function dismissalKey(caseId: string, changeKind: string, subjectKey: string): string {
  return `${caseId}␟${changeKind}␟${subjectKey}`;
}

export function isDismissed(dismissals: Dismissal[], caseId: string, changeKind: string, subjectKey: string): boolean {
  const key = dismissalKey(caseId, changeKind, subjectKey);
  return dismissals.some((d) => !d.revoked && dismissalKey(d.caseId, d.changeKind, d.subjectKey) === key);
}
