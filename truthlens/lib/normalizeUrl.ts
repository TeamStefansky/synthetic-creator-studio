// Normalize arbitrary user input into a canonical URL + bare domain.

export interface NormalizedUrl {
  url: string; // full normalized URL with scheme
  domain: string; // registrable host, lowercased, no www.
  scheme: string;
}

export function normalizeUrl(input: string): NormalizedUrl {
  let raw = (input || "").trim();
  if (!raw) throw new Error("Empty URL");

  // Add scheme if the user pasted a bare domain.
  if (!/^https?:\/\//i.test(raw)) {
    raw = "https://" + raw;
  }

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }

  const host = u.hostname.toLowerCase();
  const domain = host.replace(/^www\./, "");

  if (!domain.includes(".")) {
    throw new Error("URL has no valid domain");
  }

  return {
    url: u.toString(),
    domain,
    scheme: u.protocol.replace(":", ""),
  };
}

/** Levenshtein edit distance - used for typosquatting detection in scoring. */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[n];
}

/** Strip the public suffix-ish tail to compare the "brand" part of a domain. */
export function brandPart(domain: string): string {
  const parts = domain.split(".");
  if (parts.length <= 2) return parts[0];
  // crude: take the label before the last two (handles foo.co.uk reasonably)
  return parts[parts.length - 3] || parts[0];
}
