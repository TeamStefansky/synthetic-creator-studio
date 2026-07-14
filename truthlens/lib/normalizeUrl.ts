// Normalize and validate user-supplied URLs.
// Accepts "example.com", "http://example.com/path", "https://www.example.com"
// and returns a canonical { url, domain, scheme } or throws on garbage input.

export interface NormalizedUrl {
  url: string; // full normalized URL
  domain: string; // registrable host, lowercased, no leading www.
  host: string; // host as given (may include www / subdomain)
  scheme: string; // http | https
}

export function normalizeUrl(input: string): NormalizedUrl {
  if (!input || typeof input !== "string") {
    throw new Error("No URL provided");
  }

  let raw = input.trim();

  // If the user omitted a scheme, default to https://
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }

  const host = parsed.hostname.toLowerCase();

  // Basic sanity: must look like a hostname with a dot (a TLD).
  if (!host.includes(".") || /\s/.test(host)) {
    throw new Error("Invalid domain");
  }

  // Reject obvious non-public hosts to avoid SSRF-style local probing.
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) // raw IP literals
  ) {
    throw new Error("Local or IP-literal hosts are not supported");
  }

  const domain = host.replace(/^www\./, "");

  return {
    url: parsed.toString(),
    domain,
    host,
    scheme: parsed.protocol.replace(":", ""),
  };
}
