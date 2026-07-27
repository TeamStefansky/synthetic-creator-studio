"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { ApiSourceOut, Page } from "@/lib/api/types";
import { t } from "@/lib/strings.en";
import { COUNTRIES } from "@/lib/countries";
import { countryFlag } from "@/lib/format";
import { EmptyState, ErrorState, Skeleton } from "@/components/states";

export function GlobalSources() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["api-sources"],
    queryFn: () =>
      apiFetch<Page<ApiSourceOut>>("/api-sources", { query: { limit: 100, offset: 0 } }),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiFetch<ApiSourceOut>(`/api-sources/${id}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-sources"] }),
  });

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError)
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;

  const items = q.data?.items ?? [];
  if (!items.length)
    return (
      <EmptyState
        title={t.sources.globalHeading}
        body="No global providers configured (GDELT, Perigon)."
      />
    );

  const toggleCountry = (src: ApiSourceOut, code: string) => {
    const cur = new Set(src.country_filter ?? []);
    if (cur.has(code)) cur.delete(code);
    else cur.add(code);
    patch.mutate({ id: src.id, body: { country_filter: cur.size ? [...cur] : null } });
  };

  return (
    <div className="space-y-4">
      <h3 className="font-headline text-lg text-ink">{t.sources.globalHeading}</h3>
      {items.map((src) => {
        const isPerigon = src.provider === "perigon";
        return (
          <div key={src.id} className="rounded-lg border border-line bg-paper p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-ink">
                  {src.name}{" "}
                  <span className="text-xs uppercase text-ink-faint">({src.provider})</span>
                </p>
                {isPerigon ? (
                  <p className="mt-1 text-xs text-amber-700">{t.sources.perigonUnavailable}</p>
                ) : null}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={src.enabled}
                  onChange={(e) => patch.mutate({ id: src.id, body: { enabled: e.target.checked } })}
                />
                {t.sources.globalEnabled}
              </label>
            </div>

            <div className="mt-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">
                {t.sources.countryScope}
              </p>
              <div className="flex flex-wrap gap-1">
                {COUNTRIES.slice(0, 12).map((c) => {
                  const active = (src.country_filter ?? []).includes(c.code);
                  return (
                    <button
                      key={c.code}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleCountry(src, c.code)}
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        active
                          ? "border-ink bg-ink text-paper"
                          : "border-line bg-paper text-ink-soft hover:border-ink"
                      }`}
                    >
                      {countryFlag(c.code)} {c.code}
                    </button>
                  );
                })}
              </div>
            </div>

            {src.lang_filter && src.lang_filter.length ? (
              <p className="mt-2 text-xs text-ink-muted">
                {t.sources.langScope}: {src.lang_filter.join(", ")}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
