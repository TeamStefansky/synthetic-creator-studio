"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { EditionSummaryOut, Page } from "@/lib/api/types";
import { clockTime, isStale } from "@/lib/format";
import { t } from "@/lib/strings.en";

type Props = {
  generatedAt: string;
  itemCount: number;
  /** hide refresh + new-edition polling in read-only public mode */
  readOnly?: boolean;
};

export function EditionHeader({ generatedAt, itemCount, readOnly }: Props) {
  const router = useRouter();

  const refresh = useMutation({
    mutationFn: () =>
      apiFetch<EditionSummaryOut>("/site/refresh", { method: "POST" }),
    onSuccess: () => router.refresh(),
  });

  // Poll for a newer edition without ever reloading the page under the reader.
  const latest = useQuery({
    queryKey: ["editions", "latest"],
    queryFn: () =>
      apiFetch<Page<EditionSummaryOut>>("/site/editions", {
        query: { limit: 1, offset: 0 },
      }),
    refetchInterval: 60_000,
    enabled: !readOnly,
  });

  const newest = latest.data?.items?.[0]?.generated_at;
  const hasNewer = !!newest && new Date(newest).getTime() > new Date(generatedAt).getTime();
  const stale = isStale(generatedAt);

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-headline text-2xl text-ink">
            {t.frontPage.edition(clockTime(generatedAt))}
          </h1>
          <span className="text-sm text-ink-faint">{itemCount} stories</span>
        </div>
        {!readOnly ? (
          <button
            type="button"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="rounded border border-ink px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink hover:text-paper disabled:opacity-50"
          >
            {refresh.isPending ? t.frontPage.refreshing : t.frontPage.refresh}
          </button>
        ) : null}
      </div>

      {stale ? (
        <p className="mt-2 rounded bg-wash px-3 py-1.5 text-xs text-ink-muted">
          {t.frontPage.stale}
        </p>
      ) : null}

      {!readOnly && hasNewer ? (
        <div
          role="status"
          className="mt-3 flex items-center justify-between gap-3 rounded border border-accent-soft bg-wash px-3 py-2 text-sm"
        >
          <span className="text-ink-soft">{t.frontPage.newEdition}</span>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded bg-accent px-3 py-1 text-xs font-medium text-paper hover:opacity-90"
          >
            {t.frontPage.loadNewEdition}
          </button>
        </div>
      ) : null}

      {refresh.isError ? (
        <p className="mt-2 text-xs text-accent">{(refresh.error as Error).message}</p>
      ) : null}
    </div>
  );
}
