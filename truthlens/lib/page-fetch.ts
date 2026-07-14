// Fetch the target page itself: follow redirects, capture final URL, status,
// response headers and the raw HTML body for downstream fingerprinting.

import { fetchWithTimeout } from "./httpClient";

export interface PageFetchResult {
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  html: string;
  validHttps: boolean;
  ok: boolean;
}

export async function fetchPage(url: string): Promise<PageFetchResult | null> {
  try {
    const res = await fetchWithTimeout(url, {
      redirect: "follow",
      timeoutMs: 9000,
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Cap body size to keep parsing fast and memory bounded.
    const raw = await res.text();
    const html = raw.length > 800_000 ? raw.slice(0, 800_000) : raw;

    return {
      finalUrl: res.url || url,
      status: res.status,
      headers,
      html,
      validHttps: (res.url || url).startsWith("https://") && res.ok,
      ok: res.ok,
    };
  } catch {
    // Could be TLS failure, timeout, DNS error, etc. — treat as no valid HTTPS.
    return null;
  }
}
