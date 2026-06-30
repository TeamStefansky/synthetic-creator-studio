// Fetch the target page: follow redirects, capture final URL + status +
// headers + HTML body. Tolerant of failures.

import { fetchWithTimeout } from "./http";

export interface PageResult {
  ok: boolean;
  finalUrl?: string;
  status?: number;
  headers: Record<string, string>;
  html: string;
  error?: string;
}

export async function fetchPage(url: string): Promise<PageResult> {
  try {
    const res = await fetchWithTimeout(url, {
      timeoutMs: 9000,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    let html = "";
    const ct = headers["content-type"] || "";
    if (/text|html|json|xml/i.test(ct) || !ct) {
      html = await res.text();
    }
    return {
      ok: res.ok,
      finalUrl: res.url,
      status: res.status,
      headers,
      html,
    };
  } catch (e: any) {
    return {
      ok: false,
      headers: {},
      html: "",
      error: e?.message || "fetch failed",
    };
  }
}
