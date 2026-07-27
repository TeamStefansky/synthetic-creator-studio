"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { DiscoveredFeedOut, FeedOut } from "@/lib/api/types";
import { t } from "@/lib/strings.en";
import { countryFlag } from "@/lib/format";

export function Discovery() {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [candidates, setCandidates] = useState<DiscoveredFeedOut[] | null>(null);

  const discover = useMutation({
    mutationFn: (u: string) =>
      apiFetch<DiscoveredFeedOut[]>("/feeds/discover", { method: "POST", body: { url: u } }),
    onSuccess: (feeds) => setCandidates(feeds),
  });

  const subscribe = useMutation({
    mutationFn: (feed: DiscoveredFeedOut) =>
      apiFetch<FeedOut>("/feeds", {
        method: "POST",
        body: {
          feed_url: feed.feed_url,
          title: feed.title,
          country_code: feed.detected_country ?? undefined,
          lang: feed.detected_lang ?? undefined,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feeds"] }),
  });

  return (
    <div className="rounded-lg border border-line bg-paper p-5">
      <h3 className="font-headline text-lg text-ink">{t.sources.discoverHeading}</h3>
      <div className="mt-3 flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t.sources.discoverPlaceholder}
          className="flex-1 rounded border border-line bg-wash px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => discover.mutate(url)}
          disabled={!url.trim() || discover.isPending}
          className="rounded bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-accent disabled:opacity-50"
        >
          {discover.isPending ? t.sources.discoverSubmitting : t.sources.discoverSubmit}
        </button>
      </div>
      {discover.isError ? (
        <p className="mt-2 text-sm text-accent">{(discover.error as Error).message}</p>
      ) : null}

      {candidates ? (
        candidates.length ? (
          <ul className="mt-4 divide-y divide-line rounded border border-line">
            {candidates.map((f) => (
              <li key={f.feed_url} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {f.title ?? f.site_title ?? f.feed_url}
                  </p>
                  <p className="truncate text-xs text-ink-faint">
                    {f.detected_country ? countryFlag(f.detected_country) + " " : ""}
                    {f.feed_url} · {f.item_count} items
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => subscribe.mutate(f)}
                  className="shrink-0 rounded border border-ink px-3 py-1 text-xs text-ink hover:bg-ink hover:text-paper"
                >
                  {t.sources.subscribe}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-ink-muted">{t.sources.discoverNone}</p>
        )
      ) : null}
    </div>
  );
}
