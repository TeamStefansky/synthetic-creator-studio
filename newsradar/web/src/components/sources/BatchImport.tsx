"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { BatchJobDetailOut, BatchJobOut, BatchResultOut } from "@/lib/api/types";
import { t } from "@/lib/strings.en";

const TERMINAL = "done";

const STATUS_STYLE: Record<string, string> = {
  added: "bg-green-100 text-green-800",
  duplicate: "bg-amber-100 text-amber-800",
  no_feed: "bg-zinc-200 text-zinc-700",
  invalid: "bg-zinc-200 text-zinc-700",
  error: "bg-red-100 text-red-800",
};

const STATUS_LABEL: Record<string, string> = {
  added: "added",
  duplicate: "duplicate",
  no_feed: "no feed found",
  invalid: "invalid",
  error: "error",
};

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        STATUS_STYLE[status] ?? "bg-zinc-200 text-zinc-700"
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function BatchImport() {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const start = useMutation({
    mutationFn: (body: string) =>
      apiFetch<BatchJobOut>("/sources/batch", { method: "POST", body: { text: body } }),
    onSuccess: (job) => setJobId(job.id),
  });

  const job = useQuery({
    queryKey: ["batch", jobId],
    queryFn: () => apiFetch<BatchJobDetailOut>(`/sources/batch/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data?.status === TERMINAL ? false : 1000),
  });

  const data = job.data;
  const done = data?.status === TERMINAL;
  const results: BatchResultOut[] = data?.results ?? [];
  const failed = results.filter((r) => r.status === "no_feed" || r.status === "invalid" || r.status === "error");

  const pct = data && data.total > 0 ? Math.round((data.processed / data.total) * 100) : 0;

  const copyFailed = async () => {
    await navigator.clipboard.writeText(failed.map((r) => r.input_line).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-lg border border-line bg-paper p-5">
      <h3 className="font-headline text-lg text-ink">{t.sources.pasteHeading}</h3>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t.sources.pastePlaceholder}
        rows={6}
        className="mt-3 w-full rounded border border-line bg-wash p-3 font-mono text-sm"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setJobId(null);
            start.mutate(text);
          }}
          disabled={!text.trim() || start.isPending}
          className="rounded bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-accent disabled:opacity-50"
        >
          {start.isPending ? t.sources.pasteImporting : t.sources.pasteSubmit}
        </button>
        {start.isError ? (
          <span className="text-sm text-accent">{(start.error as Error).message}</span>
        ) : null}
      </div>

      {jobId && data ? (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-sm text-ink-muted">
            <span>{t.sources.batchProgress(data.processed, data.total)}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-wash">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${pct}%` }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>

          {results.length ? (
            <div className="mt-4 max-h-80 overflow-auto rounded border border-line">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-wash text-xs uppercase text-ink-faint">
                  <tr>
                    <th className="px-3 py-2">Input</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Feed</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={`${r.input_line}-${i}`} className="border-t border-line">
                      <td className="px-3 py-2 font-mono text-xs">{r.input_line}</td>
                      <td className="px-3 py-2">
                        <StatusChip status={r.status} />
                        {r.error ? (
                          <span className="ml-2 text-xs text-ink-faint">{r.error}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-muted">{r.feed_url ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {done && failed.length ? (
            <button
              type="button"
              onClick={copyFailed}
              className="mt-3 rounded border border-ink px-3 py-1.5 text-sm text-ink hover:bg-ink hover:text-paper"
            >
              {copied ? t.sources.copied : t.sources.copyFailed}
            </button>
          ) : null}

          {done ? (
            <button
              type="button"
              onClick={() => qc.invalidateQueries({ queryKey: ["feeds"] })}
              className="ml-2 mt-3 text-sm text-ink-muted underline hover:text-accent"
            >
              Refresh subscriptions
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
