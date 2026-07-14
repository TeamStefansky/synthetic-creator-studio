// Google Fact Check Tools API — claims:search.
// Optional: only runs if GOOGLE_FACTCHECK_KEY is set. Returns any fact-check
// articles that reference the domain, which is a strong reputation signal.

import { getJson } from "./httpClient";
import type { FactCheckItem } from "./types";

interface FactCheckApiResponse {
  claims?: {
    text?: string;
    claimReview?: {
      publisher?: { name?: string; site?: string };
      textualRating?: string;
      url?: string;
    }[];
  }[];
}

export async function lookupFactChecks(
  domain: string
): Promise<FactCheckItem[]> {
  const key = process.env.GOOGLE_FACTCHECK_KEY;
  if (!key) return [];

  const url =
    `https://factchecktools.googleapis.com/v1alpha1/claims:search` +
    `?query=${encodeURIComponent(domain)}&languageCode=en&pageSize=10&key=${key}`;

  const json = await getJson<FactCheckApiResponse>(url);
  if (!json?.claims) return [];

  const items: FactCheckItem[] = [];
  for (const claim of json.claims) {
    const review = claim.claimReview?.[0];
    if (!review) continue;
    items.push({
      claim: claim.text ?? "(no claim text)",
      publisher: review.publisher?.name ?? review.publisher?.site ?? "Unknown",
      rating: review.textualRating ?? null,
      url: review.url ?? null,
    });
  }
  return items.slice(0, 8);
}
