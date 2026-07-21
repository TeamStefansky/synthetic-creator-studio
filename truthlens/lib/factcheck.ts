// Google Fact Check Tools API (claims:search). Optional - needs a key.

import { getJson } from "./http";
import type { FactCheckItem } from "./types";

interface FactCheckApiResp {
  claims?: {
    text?: string;
    claimReview?: {
      publisher?: { name?: string; site?: string };
      textualRating?: string;
      url?: string;
    }[];
  }[];
}

export async function lookupFactChecks(domain: string): Promise<FactCheckItem[]> {
  const key = process.env.GOOGLE_FACTCHECK_KEY;
  if (!key) return [];

  const data = await getJson<FactCheckApiResp>(
    `https://factchecktools.googleapis.com/v1alpha1/claims:search?query=${encodeURIComponent(
      domain,
    )}&key=${key}`,
  );
  if (!data?.claims) return [];

  const items: FactCheckItem[] = [];
  for (const claim of data.claims) {
    const review = claim.claimReview?.[0];
    if (!review) continue;
    items.push({
      claim: claim.text || "",
      publisher: review.publisher?.name || review.publisher?.site || "unknown",
      rating: review.textualRating || "unrated",
      url: review.url,
    });
  }
  return items.slice(0, 10);
}
