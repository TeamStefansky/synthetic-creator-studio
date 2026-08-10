// Tiny KV store over the Upstash Redis REST protocol - works with both
// Vercel KV (KV_REST_API_URL / KV_REST_API_TOKEN) and Upstash directly
// (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). No SDK, just fetch.
// Used to persist monitoring snapshots so we can detect changes over time.

function creds(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

export function storeAvailable(): boolean {
  return creds() !== null;
}

async function command(args: (string | number)[]): Promise<any> {
  const c = creds();
  if (!c) throw new Error("KV store not configured");
  const res = await fetch(c.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`KV error ${res.status}`);
  const data = await res.json();
  return data?.result;
}

export async function kvGet(key: string): Promise<string | null> {
  try {
    const r = await command(["GET", key]);
    return r == null ? null : String(r);
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: string): Promise<void> {
  try {
    await command(["SET", key, value]);
  } catch {
    /* best-effort */
  }
}

/** Atomic counter with a TTL, for rate limiting. Returns the post-increment
 * count (1 on the first hit of a window); 0 on any KV error (fail-open — a
 * broken limiter must never lock out a valid key). Sets the TTL only on create. */
export async function kvIncr(key: string, ttlSec: number): Promise<number> {
  try {
    const n = Number(await command(["INCR", key]));
    if (n === 1) await command(["EXPIRE", key, ttlSec]);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export async function kvGetJson<T>(key: string): Promise<T | null> {
  const raw = await kvGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function kvSetJson<T>(key: string, value: T): Promise<void> {
  await kvSet(key, JSON.stringify(value));
}
