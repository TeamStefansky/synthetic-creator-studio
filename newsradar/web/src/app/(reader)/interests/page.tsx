"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { InterestOut, Page } from "@/lib/api/types";
import { t } from "@/lib/strings.en";
import { InterestEditor } from "@/components/interests/InterestEditor";
import { InterestPreview } from "@/components/interests/InterestPreview";
import { EmptyState, ErrorState, Skeleton } from "@/components/states";

export default function InterestsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);

  const list = useQuery({
    queryKey: ["interests"],
    queryFn: () =>
      apiFetch<Page<InterestOut>>("/interests", { query: { limit: 100, offset: 0 } }),
  });

  const interests = list.data?.items ?? [];
  const selected = interests.find((i) => i.id === selectedId) ?? null;
  const editing = creating ? null : selected;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-headline text-3xl text-ink">{t.interests.title}</h1>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setSelectedId(null);
          }}
          className="rounded bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-accent"
        >
          {t.interests.create}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr_20rem]">
        <nav aria-label="Interests" className="space-y-1">
          {list.isLoading ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)
          ) : list.isError ? (
            <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
          ) : !interests.length && !creating ? (
            <EmptyState title={t.interests.title} body={t.interests.empty} />
          ) : (
            interests.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => {
                  setCreating(false);
                  setSelectedId(i.id);
                }}
                className={`block w-full truncate rounded px-3 py-2 text-left text-sm ${
                  editing?.id === i.id
                    ? "bg-ink text-paper"
                    : "text-ink-soft hover:bg-wash"
                }`}
              >
                {i.name}
                {!i.active ? <span className="ml-2 text-xs opacity-70">(off)</span> : null}
              </button>
            ))
          )}
        </nav>

        {creating || selected ? (
          <>
            <InterestEditor
              interest={editing}
              onSaved={(i) => {
                setCreating(false);
                setSelectedId(i.id);
              }}
              onDeleted={() => {
                setSelectedId(null);
                setCreating(false);
              }}
              onPreviewBump={() => setPreviewVersion((v) => v + 1)}
            />
            <InterestPreview interestId={editing?.id ?? null} version={previewVersion} />
          </>
        ) : (
          <div className="lg:col-span-2">
            <EmptyState
              title={t.interests.title}
              body={interests.length ? "Select an interest to edit, or create a new one." : t.interests.empty}
            />
          </div>
        )}
      </div>
    </div>
  );
}
