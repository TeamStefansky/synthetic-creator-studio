// Small fetch helpers: timeout + a normal User-Agent on every outbound call.

export const DEFAULT_UA =
  "Mozilla/5.0 (compatible; TruthLens/0.1; +https://github.com/teamstefansky/synthetic-creator-studio)";

export interface FetchOpts extends RequestInit {
  timeoutMs?: number;
}

/** fetch() with an AbortController timeout (default 8s) and a normal UA. */
export async function fetchWithTimeout(
  url: string,
  opts: FetchOpts = {},
): Promise<Response> {
  const { timeoutMs = 8000, headers, ...rest } = opts;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...rest,
      signal: ctrl.signal,
      headers: {
        "User-Agent": DEFAULT_UA,
        Accept: "*/*",
        ...headers,
      },
    });
  } finally {
    clearTimeout(t);
  }
}

/** GET JSON with timeout; returns null on any failure (callers degrade gracefully). */
export async function getJson<T = any>(
  url: string,
  opts: FetchOpts = {},
): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(url, opts);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** GET text with timeout; returns null on any failure. */
export async function getText(
  url: string,
  opts: FetchOpts = {},
): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url, opts);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
