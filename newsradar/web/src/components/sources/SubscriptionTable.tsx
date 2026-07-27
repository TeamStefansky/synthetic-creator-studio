"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUrl } from "@/lib/api/client";
import type {
  ContentRights,
  FeedHealthOut,
  FeedOut,
  Page,
  SourceOut,
} from "@/lib/api/types";
import { t } from "@/lib/strings.en";
import { countryLabel, relativeTime } from "@/lib/format";
import { EmptyState, ErrorState, Skeleton } from "@/components/states";
import { RightsBadge, RightsDialog } from "./RightsDialog";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function SubscriptionTable() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rightsFor, setRightsFor] = useState<{ sourceId: string; current: ContentRights } | null>(
    null,
  );
  const [tagDraft, setTagDraft] = useState<Record<string, string>>({});

  const feeds = useQuery({
    queryKey: ["feeds"],
    queryFn: () => apiFetch<Page<FeedOut>>("/feeds", { query: { limit: 200, offset: 0 } }),
  });
  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: () => apiFetch<Page<SourceOut>>("/sources", { query: { limit: 200, offset: 0 } }),
  });
  const health = useQuery({
    queryKey: ["feeds", "health"],
    queryFn: () => apiFetch<FeedHealthOut[]>("/feeds/health"),
  });

  const sourceById = useMemo(() => {
    const m = new Map<string, SourceOut>();
    for (const s of sources.data?.items ?? []) m.set(s.id, s);
    return m;
  }, [sources.data]);
  const healthByUrl = useMemo(() => {
    const m = new Map<string, FeedHealthOut>();
    for (const h of health.data ?? []) m.set(h.feed_url, h);
    return m;
  }, [health.data]);

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiFetch<FeedOut>(`/feeds/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feeds"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/feeds/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feeds"] }),
  });

  const items = feeds.data?.items ?? [];

  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const bulkDeactivate = () =>
    selected.forEach((id) => patch.mutate({ id, body: { active: false } }));
  const bulkDelete = () => {
    if (confirm(`Delete ${selected.size} subscriptions?`)) {
      selected.forEach((id) => remove.mutate(id));
      setSelected(new Set());
    }
  };
  const exportOpml = () => window.open(apiUrl("/feeds/export-opml"), "_blank");

  if (feeds.isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (feeds.isError) {
    return (
      <ErrorState
        message={(feeds.error as Error).message}
        onRetry={() => feeds.refetch()}
      />
    );
  }
  if (!items.length) {
    return <EmptyState title={t.sources.subsHeading} body={t.sources.empty} />;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-headline text-lg text-ink">{t.sources.subsHeading}</h3>
        <span className="text-sm text-ink-faint">{feeds.data?.total ?? items.length}</span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={!selected.size}
            onClick={bulkDeactivate}
            className="rounded border border-line px-3 py-1 text-xs text-ink-soft hover:border-ink disabled:opacity-40"
          >
            {t.sources.bulkDeactivate}
          </button>
          <button
            type="button"
            disabled={!selected.size}
            onClick={bulkDelete}
            className="rounded border border-line px-3 py-1 text-xs text-ink-soft hover:border-ink disabled:opacity-40"
          >
            {t.sources.bulkDelete}
          </button>
          <button
            type="button"
            onClick={exportOpml}
            className="rounded border border-line px-3 py-1 text-xs text-ink-soft hover:border-ink"
          >
            {t.sources.bulkExport}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-line">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="bg-wash text-xs uppercase text-ink-faint">
            <tr>
              <th className="w-8 px-3 py-2" />
              <th className="px-3 py-2">{t.sources.colTitle}</th>
              <th className="px-3 py-2">{t.sources.colDomain}</th>
              <th className="px-3 py-2">{t.sources.colCountry}</th>
              <th className="px-3 py-2">{t.sources.colTags}</th>
              <th className="px-3 py-2">{t.sources.colLastPoll}</th>
              <th className="px-3 py-2">{t.sources.colFailures}</th>
              <th className="px-3 py-2">{t.sources.colRights}</th>
              <th className="px-3 py-2">{t.sources.colActive}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((f) => {
              const source = sourceById.get(f.source_id);
              const h = healthByUrl.get(f.feed_url);
              const failing = f.consecutive_failures >= 3;
              const autoOff = !f.active && (h?.deactivated_reason || failing);
              const rights = (source?.content_rights ?? "link_only") as ContentRights;
              const tags = f.tags ?? [];
              return (
                <tr
                  key={f.id}
                  className={`border-t border-line ${
                    autoOff ? "bg-red-50" : failing ? "bg-amber-50" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(f.id)}
                      onChange={() => toggleSel(f.id)}
                      aria-label={`Select ${f.title ?? f.feed_url}`}
                    />
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 font-medium text-ink">
                    {f.title ?? source?.name ?? hostOf(f.feed_url)}
                    {autoOff ? (
                      <span className="ml-2 text-xs text-red-700">
                        {t.sources.autoDeactivated}
                      </span>
                    ) : failing ? (
                      <span className="ml-2 text-xs text-amber-700">{t.sources.failing}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {source?.domain ?? hostOf(f.feed_url)}
                  </td>
                  <td className="px-3 py-2">
                    {countryLabel(f.country_code ?? source?.country_code)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full bg-wash px-2 py-0.5 text-xs"
                        >
                          {tag}
                          <button
                            type="button"
                            aria-label={`Remove ${tag}`}
                            onClick={() =>
                              patch.mutate({
                                id: f.id,
                                body: { tags: tags.filter((x) => x !== tag) },
                              })
                            }
                            className="text-ink-faint hover:text-accent"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <input
                        value={tagDraft[f.id] ?? ""}
                        onChange={(e) =>
                          setTagDraft((d) => ({ ...d, [f.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const val = (tagDraft[f.id] ?? "").trim();
                            if (val && !tags.includes(val)) {
                              patch.mutate({ id: f.id, body: { tags: [...tags, val] } });
                            }
                            setTagDraft((d) => ({ ...d, [f.id]: "" }));
                          }
                        }}
                        placeholder="+ tag"
                        className="w-16 rounded border border-line bg-paper px-1 text-xs"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-muted">
                    {relativeTime(f.last_ok_at ?? f.last_polled_at)}
                  </td>
                  <td className="px-3 py-2 text-center">{f.consecutive_failures}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        source && setRightsFor({ sourceId: source.id, current: rights })
                      }
                      disabled={!source}
                      className="disabled:cursor-not-allowed"
                      title={source ? "Change rights" : "No source linked"}
                    >
                      <RightsBadge rights={rights} />
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {autoOff ? (
                      <button
                        type="button"
                        onClick={() => patch.mutate({ id: f.id, body: { active: true } })}
                        className="rounded border border-red-500 px-2 py-0.5 text-xs text-red-700 hover:bg-red-500 hover:text-paper"
                      >
                        {t.sources.reactivate}
                      </button>
                    ) : (
                      <label className="inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={f.active}
                          onChange={(e) =>
                            patch.mutate({ id: f.id, body: { active: e.target.checked } })
                          }
                          aria-label={t.sources.colActive}
                        />
                      </label>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rightsFor ? (
        <RightsDialog
          sourceId={rightsFor.sourceId}
          current={rightsFor.current}
          onClose={() => setRightsFor(null)}
        />
      ) : null}
    </div>
  );
}
