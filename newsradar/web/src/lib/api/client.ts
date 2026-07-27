/**
 * Thin typed fetch wrapper around the NewsRadar FastAPI backend.
 *
 * Works in both Server Components (uses API_BASE) and the browser (uses
 * NEXT_PUBLIC_API_BASE). All backend I/O flows through here so error handling
 * and base-URL resolution live in one place. No source content is ever mutated
 * or enriched client-side.
 */

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function baseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.API_BASE ?? "http://localhost:8000";
  }
  return process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
}

export type RequestOpts = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Server Components: revalidate seconds (default no-store for freshness). */
  revalidate?: number;
  signal?: AbortSignal;
};

function buildUrl(path: string, query?: RequestOpts["query"]): string {
  const url = new URL(path.replace(/^\//, ""), baseUrl().replace(/\/?$/, "/"));
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function apiFetch<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = "GET", body, query, revalidate, signal } = opts;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const init: RequestInit & { next?: { revalidate: number } } = {
    method,
    headers,
    signal,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
  if (typeof window === "undefined") {
    if (revalidate !== undefined) init.next = { revalidate };
    else init.cache = "no-store";
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), init);
  } catch (err) {
    throw new ApiError(0, `Network error contacting the API: ${(err as Error).message}`);
  }

  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text().catch(() => "");
    }
    const message =
      (detail && typeof detail === "object" && "detail" in detail
        ? String((detail as { detail: unknown }).detail)
        : `Request failed (${res.status})`) || `Request failed (${res.status})`;
    throw new ApiError(res.status, message, detail);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/** Raw fetch for non-JSON responses (feeds, OPML export, PDF). */
export function apiUrl(path: string, query?: RequestOpts["query"]): string {
  return buildUrl(path, query);
}
