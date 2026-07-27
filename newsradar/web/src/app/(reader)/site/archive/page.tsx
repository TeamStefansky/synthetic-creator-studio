"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { EditionOut, EditionSummaryOut, Page } from "@/lib/api/types";
import { t } from "@/lib/strings.en";
import { dateLabel, clockTime } from "@/lib/format";
import { groupSections } from "@/lib/edition-view";
import { EditionView } from "@/components/EditionView";
import { EmptyState, ErrorState, Skeleton } from "@/components/states";

export default function ArchivePage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["editions", "archive"],
    queryFn: () =>
      apiFetch<Page<EditionSummaryOut>>("/site/editions", { query: { limit: 60, offset: 0 } }),
  });

  const editions = useMemo(() => list.data?.items ?? [], [list.data]);
  useEffect(() => {
    if (!selectedId && editions.length) setSelectedId(editions[0]!.id);
  }, [editions, selectedId]);

  const detail = useQuery({
    queryKey: ["edition", selectedId],
    queryFn: () => apiFetch<EditionOut>(`/site/editions/${selectedId}`),
    enabled: !!selectedId,
  });

  const sections = detail.data
    ? groupSections(detail.data, detail.data.items ?? [])
    : [];

  return (
    <div>
      <h1 className="mb-6 font-headline text-3xl text-ink">{t.nav.archive}</h1>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Past editions" className="space-y-1">
          {list.isLoading ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)
          ) : list.isError ? (
            <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
          ) : !editions.length ? (
            <p className="text-sm text-ink-muted">{t.frontPage.emptyBody}</p>
          ) : (
            editions.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setSelectedId(e.id)}
                className={`block w-full rounded px-3 py-2 text-left text-sm ${
                  selectedId === e.id ? "bg-ink text-paper" : "text-ink-soft hover:bg-wash"
                }`}
              >
                <span className="block">{dateLabel(e.generated_at)}</span>
                <span className="block text-xs opacity-70">
                  {clockTime(e.generated_at)} · {e.item_count} stories
                </span>
              </button>
            ))
          )}
        </nav>

        <div>
          {!selectedId ? (
            <EmptyState title={t.nav.archive} body={t.frontPage.emptyBody} />
          ) : detail.isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : detail.isError ? (
            <ErrorState message={(detail.error as Error).message} onRetry={() => detail.refetch()} />
          ) : sections.length ? (
            <EditionView sections={sections} />
          ) : (
            <EmptyState title={t.nav.archive} body={t.states.empty} />
          )}
        </div>
      </div>
    </div>
  );
}
