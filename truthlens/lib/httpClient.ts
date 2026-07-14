// Small fetch helper with a sane timeout and a normal browser User-Agent.
// Every outbound call in TruthLens goes through this so we get consistent
// timeouts and never hang the whole report on one slow upstream API.

const DEFAULT_TIMEOUT_MS = 8000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 TruthLens/1.0";

export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
}

/** fetch() with an AbortController-based timeout and default headers. */
export async function fetchWithTimeout(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "*/*",
        ...headers,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** GET + parse JSON, returning null on any failure (never throws). */
export async function getJson<T = unknown>(
  url: string,
  options: FetchOptions = {}
): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(url, options);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** GET + return text, returning null on any failure (never throws). */
export async function getText(
  url: string,
  options: FetchOptions = {}
): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url, options);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
