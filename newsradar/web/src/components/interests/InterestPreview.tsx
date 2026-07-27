"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { InterestPreviewItemOut } from "@/lib/api/types";
import { t } from "@/lib/strings.en";
import { countryFlag, relativeTime } from "@/lib/format";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { Skeleton } from "@/components/states";

/**
 * The live preview panel — the 5 most recent matches for the interest, refetched
 * (debounced upstream) as the description or slider changes. This is the primary
 * calibration surface, so it is prominent, not hidden in an accordion.
 */
export function InterestPreview({
  interestId,
  version,
}: {
  interestId: string | null;
  version: number;
}) {
  const q = useQuery({
    queryKey: ["interest-preview", interestId, version],
    queryFn: () =>
      apiFetch<InterestPreviewItemOut[]>(`/interests/${interestId}/preview`, {
        query: { limit: 5 },
      }),
    enabled: !!interestId,
  });

  return (
    <aside className="rounded-lg border border-line bg-wash p-4">
      <h3 className="font-headline text-lg text-ink">{t.interests.previewHeading}</h3>
      <p className="mb-3 text-xs text-ink-faint">{t.interests.previewHint}</p>

      {!interestId ? (
        <p className="text-sm text-ink-muted">{t.interests.previewNeedsSave}</p>
      ) : q.isLoading || q.isFetching ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <p className="text-sm text-accent">{(q.error as Error).message}</p>
      ) : !q.data?.length ? (
        <p className="text-sm text-ink-muted">{t.interests.previewEmpty}</p>
      ) : (
        <ul className="space-y-3">
          {q.data.map((item) => (
            <li key={item.document_id} className="flex gap-3">
              <span className="h-12 w-12 shrink-0 overflow-hidden rounded bg-paper">
                <ImageWithFallback
                  src={item.image_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </span>
              <div className="min-w-0">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="line-clamp-2 text-sm font-medium text-ink hover:text-accent"
                >
                  {item.title ?? "(untitled)"}
                </a>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {item.source_name}
                  {item.source_country ? ` · ${countryFlag(item.source_country)}` : ""}
                  {item.published_at ? ` · ${relativeTime(item.published_at)}` : ""}
                  {` · score ${item.match_score.toFixed(2)}`}
                </p>
                {item.matched_terms.length ? (
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {item.matched_terms.join(", ")}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
