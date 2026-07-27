"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { Page, ReportDetailOut, ReportSummaryOut } from "@/lib/api/types";
import { t } from "@/lib/strings.en";
import { fullDateTime } from "@/lib/format";
import { MarkdownView } from "@/components/MarkdownView";
import { ScheduleEditor } from "@/components/digest/ScheduleEditor";
import { EmptyState, ErrorState, Skeleton } from "@/components/states";

export default function DigestPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["reports", "digests"],
    queryFn: () =>
      apiFetch<Page<ReportSummaryOut>>("/reports", { query: { limit: 50, offset: 0 } }),
  });

  const digests = (list.data?.items ?? []).filter((r) => r.report_type === "headline_digest");

  useEffect(() => {
    if (!selectedId && digests.length) setSelectedId(digests[0]!.id);
  }, [digests, selectedId]);

  const detail = useQuery({
    queryKey: ["report", selectedId],
    queryFn: () => apiFetch<ReportDetailOut>(`/reports/${selectedId}`),
    enabled: !!selectedId,
  });

  const generate = useMutation({
    mutationFn: () =>
      apiFetch<ReportSummaryOut>("/reports/generate", {
        method: "POST",
        body: { report_type: "headline_digest", lookback_hours: 24 },
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["reports", "digests"] });
      setSelectedId(r.id);
    },
  });

  const downloadMd = () => {
    const md = detail.data?.markdown ?? "";
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `digest-${selectedId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-headline text-3xl text-ink">{t.digest.title}</h1>
        <button
          type="button"
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="rounded bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-accent disabled:opacity-50"
        >
          {generate.isPending ? t.digest.generating : t.digest.generate}
        </button>
      </div>
      {generate.isError ? (
        <p className="mb-4 text-sm text-accent">{(generate.error as Error).message}</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Digests" className="space-y-1">
          {list.isLoading ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)
          ) : list.isError ? (
            <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
          ) : !digests.length ? (
            <p className="text-sm text-ink-muted">{t.digest.empty}</p>
          ) : (
            digests.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedId(d.id)}
                className={`block w-full rounded px-3 py-2 text-left text-sm ${
                  selectedId === d.id ? "bg-ink text-paper" : "text-ink-soft hover:bg-wash"
                }`}
              >
                {fullDateTime(d.generated_at)}
              </button>
            ))
          )}
          <div className="pt-4">
            <ScheduleEditor />
          </div>
        </nav>

        <div>
          {!selectedId ? (
            <EmptyState title={t.digest.title} body={t.digest.empty} />
          ) : detail.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ) : detail.isError ? (
            <ErrorState message={(detail.error as Error).message} onRetry={() => detail.refetch()} />
          ) : (
            <article>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span className="text-sm text-ink-muted">
                  {t.digest.generatedAt(fullDateTime(detail.data?.generated_at))}
                </span>
                <button
                  type="button"
                  onClick={downloadMd}
                  className="rounded border border-ink px-3 py-1 text-xs text-ink hover:bg-ink hover:text-paper"
                >
                  {t.digest.downloadMd}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded border border-ink px-3 py-1 text-xs text-ink hover:bg-ink hover:text-paper"
                >
                  {t.digest.downloadPdf}
                </button>
              </div>
              {detail.data?.markdown ? (
                <MarkdownView markdown={detail.data.markdown} />
              ) : (
                <p className="text-sm text-ink-muted">{t.states.empty}</p>
              )}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
