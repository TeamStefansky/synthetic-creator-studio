// Programmatic API auth - key-based, for the /api/v1 surface (separate from the
// cookie gate that protects the human UI). Keys live ONLY in env
// (TRUTHLENS_API_KEYS, comma-separated); nothing is hard-coded. When no keys are
// configured the API is DISABLED and says so honestly (rule 7) - it is never
// silently open. Rate limiting is best-effort via KV; without KV it is skipped
// and disclosed, never faked.

import { kvIncr, storeAvailable } from "@/lib/store";

export const API_VERSION = "v1";
export const RATE_LIMIT_WINDOW_SEC = 60;
export const RATE_LIMIT_DEFAULT = 60; // requests per key per window

/** Parse TRUTHLENS_API_KEYS into a trimmed, deduped, non-empty set. Pure. */
export function parseApiKeys(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((k) => k.trim()).filter((k) => k.length >= 8))];
}

/** Constant-ish-time equality (length-independent early return avoided). Pure. */
export function keyMatches(candidate: string, keys: string[]): boolean {
  let ok = false;
  for (const k of keys) {
    // compare full length every time to avoid trivial timing leaks
    if (k.length === candidate.length) {
      let diff = 0;
      for (let i = 0; i < k.length; i++) diff |= k.charCodeAt(i) ^ candidate.charCodeAt(i);
      if (diff === 0) ok = true;
    }
  }
  return ok;
}

/** Extract the presented key from Authorization: Bearer … or x-api-key. Pure. */
export function extractKey(headers: Headers): string {
  const auth = headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  return (headers.get("x-api-key") || "").trim();
}

/** Non-secret short hash for the rate-limit bucket id (djb2). Pure. */
export function bucketHash(key: string): string {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Rate-limit verdict from a running count. Pure. */
export function rateLimitVerdict(count: number, limit: number): { limited: boolean; remaining: number } {
  return { limited: count > limit, remaining: Math.max(0, limit - count) };
}

export interface ApiAuthResult {
  ok: boolean;
  status: number;
  error?: string;
  /** Rate-limit headers to echo back (best-effort). */
  headers?: Record<string, string>;
}

export function apiKeysConfigured(): boolean {
  return parseApiKeys(process.env.TRUTHLENS_API_KEYS).length > 0;
}

function rateLimit(): number {
  const n = Number(process.env.TRUTHLENS_API_RATE_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : RATE_LIMIT_DEFAULT;
}

/**
 * Authenticate + rate-limit an API request. Returns an envelope the route uses
 * to short-circuit. Honest states: 503 when the API is not enabled, 401 on a
 * missing/invalid key, 429 when over the limit.
 */
export async function authenticateApi(req: Request, nowMinute: number): Promise<ApiAuthResult> {
  const keys = parseApiKeys(process.env.TRUTHLENS_API_KEYS);
  if (keys.length === 0) {
    return { ok: false, status: 503, error: "API not enabled - no TRUTHLENS_API_KEYS configured on this deployment." };
  }
  const presented = extractKey(req.headers);
  if (!presented) return { ok: false, status: 401, error: "Missing API key. Send 'Authorization: Bearer <key>' or 'x-api-key: <key>'." };
  if (!keyMatches(presented, keys)) return { ok: false, status: 401, error: "Invalid API key." };

  const limit = rateLimit();
  // Best-effort KV rate limit; when KV is absent it is skipped and disclosed.
  if (storeAvailable()) {
    const bucket = `apirl:${bucketHash(presented)}:${nowMinute}`;
    const count = await kvIncr(bucket, RATE_LIMIT_WINDOW_SEC);
    const { limited, remaining } = rateLimitVerdict(count, limit);
    const headers = { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) };
    if (limited) return { ok: false, status: 429, error: "Rate limit exceeded. Try again shortly.", headers };
    return { ok: true, status: 200, headers };
  }
  return { ok: true, status: 200, headers: { "X-RateLimit-Policy": "not-enforced (KV store not configured)" } };
}
