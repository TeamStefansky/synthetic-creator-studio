"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { apiFetch, apiUrl } from "@/lib/api/client";
import type { InterestOut, Page, ShareLinkOut } from "@/lib/api/types";
import { t } from "@/lib/strings.en";
import { fullDateTime } from "@/lib/format";
import { CopyButton } from "@/components/CopyButton";
import { EmptyState, ErrorState, Skeleton } from "@/components/states";

type Scope = "site" | "edition" | "interest" | "digest";

function absolute(path: string): string {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export default function SharePage() {
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>("site");
  const [targetId, setTargetId] = useState<string>("");
  const [label, setLabel] = useState("");
  const [expiry, setExpiry] = useState("");
  const [showQr, setShowQr] = useState<string | null>(null);

  const links = useQuery({
    queryKey: ["share-links"],
    queryFn: () => apiFetch<ShareLinkOut[]>("/share-links"),
  });
  const interests = useQuery({
    queryKey: ["interests"],
    queryFn: () =>
      apiFetch<Page<InterestOut>>("/interests", { query: { limit: 100, offset: 0 } }),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<ShareLinkOut>("/share-links", {
        method: "POST",
        body: {
          scope,
          target_id: scope === "interest" && targetId ? targetId : null,
          label: label || null,
          expires_at: expiry ? new Date(expiry).toISOString() : null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["share-links"] });
      setLabel("");
      setExpiry("");
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) =>
      apiFetch<ShareLinkOut>(`/share-links/${id}/revoke`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["share-links"] }),
  });

  const feeds = [
    { label: t.share.feedRss, url: apiUrl("/site/feed.rss") },
    { label: t.share.feedAtom, url: apiUrl("/site/feed.atom") },
    { label: t.share.feedJson, url: apiUrl("/site/feed.json") },
  ];

  const statusOf = (l: ShareLinkOut) =>
    l.revoked_at
      ? t.share.revoked
      : l.expires_at && new Date(l.expires_at) < new Date()
        ? t.share.expired
        : t.share.active;

  return (
    <div>
      <h1 className="mb-6 font-headline text-3xl text-ink">{t.share.title}</h1>

      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <section className="rounded-lg border border-line bg-paper p-5">
          <h2 className="font-headline text-lg text-ink">{t.share.create}</h2>
          <div className="mt-4 space-y-4">
            <label className="block text-sm">
              <span className="font-medium text-ink">{t.share.scope}</span>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as Scope)}
                className="mt-1 block w-full rounded border border-line bg-wash px-3 py-2"
              >
                <option value="site">{t.share.scopeSite}</option>
                <option value="edition">{t.share.scopeEdition}</option>
                <option value="interest">{t.share.scopeInterest}</option>
                <option value="digest">{t.share.scopeDigest}</option>
              </select>
            </label>

            {scope === "interest" ? (
              <label className="block text-sm">
                <span className="font-medium text-ink">{t.nav.interests}</span>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="mt-1 block w-full rounded border border-line bg-wash px-3 py-2"
                >
                  <option value="">—</option>
                  {(interests.data?.items ?? []).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block text-sm">
              <span className="font-medium text-ink">{t.share.label}</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="mt-1 block w-full rounded border border-line bg-wash px-3 py-2"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-ink">{t.share.expiry}</span>
              <input
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="mt-1 block w-full rounded border border-line bg-wash px-3 py-2"
              />
            </label>

            <button
              type="button"
              onClick={() => create.mutate()}
              disabled={create.isPending || (scope === "interest" && !targetId)}
              className="rounded bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-accent disabled:opacity-50"
            >
              {t.share.create}
            </button>
            {create.isError ? (
              <p className="text-sm text-accent">{(create.error as Error).message}</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-paper p-5">
          <h2 className="font-headline text-lg text-ink">{t.share.feedsHeading}</h2>
          <ul className="mt-3 space-y-2">
            {feeds.map((f) => (
              <li key={f.label} className="flex items-center gap-2">
                <span className="w-12 text-sm font-medium text-ink">{f.label}</span>
                <code className="flex-1 truncate rounded bg-wash px-2 py-1 text-xs">{f.url}</code>
                <CopyButton value={f.url} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 font-headline text-lg text-ink">{t.nav.share} links</h2>
        {links.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : links.isError ? (
          <ErrorState message={(links.error as Error).message} onRetry={() => links.refetch()} />
        ) : !links.data?.length ? (
          <EmptyState title={t.share.title} body={t.share.empty} />
        ) : (
          <ul className="space-y-3">
            {links.data.map((l) => {
              const full = absolute(l.url);
              return (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-paper p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">
                      {l.label || l.scope}{" "}
                      <span className="text-xs uppercase text-ink-faint">({l.scope})</span>
                    </p>
                    <code className="mt-1 block truncate text-xs text-ink-muted">{full}</code>
                    <p className="mt-1 text-xs text-ink-faint">
                      {statusOf(l)} · {t.share.views(l.view_count)}
                      {l.expires_at ? ` · expires ${fullDateTime(l.expires_at)}` : ""}
                    </p>
                  </div>
                  <CopyButton value={full} />
                  <button
                    type="button"
                    onClick={() => setShowQr(showQr === l.id ? null : l.id)}
                    className="rounded border border-line px-2 py-1 text-xs text-ink-soft hover:border-ink"
                  >
                    QR
                  </button>
                  {!l.revoked_at ? (
                    <button
                      type="button"
                      onClick={() => confirm(t.share.revokeConfirm) && revoke.mutate(l.id)}
                      className="rounded border border-accent-soft px-2 py-1 text-xs text-accent hover:bg-accent hover:text-paper"
                    >
                      {t.share.revoke}
                    </button>
                  ) : null}
                  {showQr === l.id ? (
                    <div className="w-full pt-2">
                      <QRCodeSVG value={full} size={128} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
