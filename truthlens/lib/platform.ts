// Client helpers for the narrative-intel platform API, via the same-origin proxy.

export class PlatformUnavailable extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "PlatformUnavailable";
  }
}

async function handle(res: Response) {
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if (res.status === 503 && data && (data as any).unavailable) {
    throw new PlatformUnavailable((data as any).reason || "Platform API unavailable");
  }
  if (!res.ok) {
    const detail = (data as any)?.detail || (data as any)?.reason || res.statusText;
    throw new Error(typeof detail === "string" ? detail : "Request failed");
  }
  return data;
}

export function apiGet<T = any>(path: string): Promise<T> {
  return fetch(`/api/platform/${path}`, { cache: "no-store" }).then(handle);
}

export function apiPost<T = any>(path: string, body?: unknown): Promise<T> {
  return fetch(`/api/platform/${path}`, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then(handle);
}

export function apiDelete<T = any>(path: string): Promise<T> {
  return fetch(`/api/platform/${path}`, { method: "DELETE" }).then(handle);
}

// Report links open the server-rendered HTML report in a new tab.
export const reportUrl = (kind: "campaign" | "narrative", id: number) =>
  `/api/platform/report/${kind}/${id}`;
