"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { ContentRights, SourceOut } from "@/lib/api/types";
import { t } from "@/lib/strings.en";

export const RIGHTS_LABEL: Record<ContentRights, string> = {
  link_only: t.sources.rightsLinkOnly,
  extract_ok: t.sources.rightsExtract,
  full_ok: t.sources.rightsFull,
};

const RIGHTS_STYLE: Record<ContentRights, string> = {
  link_only: "bg-zinc-200 text-zinc-700",
  extract_ok: "bg-blue-100 text-blue-800",
  full_ok: "bg-purple-100 text-purple-800",
};

export function RightsBadge({ rights }: { rights: ContentRights }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RIGHTS_STYLE[rights]}`}>
      {RIGHTS_LABEL[rights]}
    </span>
  );
}

/**
 * Change-rights dialog. Upgrading to a tier above link_only requires a
 * justification note; the API rejects (422) an upgrade without one, and this
 * dialog blocks submission client-side too. Default for every source is
 * link_only and the UI never suggests upgrading.
 */
export function RightsDialog({
  sourceId,
  current,
  onClose,
}: {
  sourceId: string;
  current: ContentRights;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [rights, setRights] = useState<ContentRights>(current);
  const [note, setNote] = useState("");

  const needsNote = rights === "full_ok" || rights === "extract_ok";
  const noteMissing = needsNote && !note.trim();

  const save = useMutation({
    mutationFn: () =>
      apiFetch<SourceOut>(`/sources/${sourceId}/rights`, {
        method: "PATCH",
        body: { content_rights: rights, rights_note: note.trim() || null },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sources"] });
      onClose();
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.sources.rightsDialogTitle}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-paper p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-headline text-lg text-ink">{t.sources.rightsDialogTitle}</h3>

        <fieldset className="mt-4 space-y-2">
          {(["link_only", "extract_ok", "full_ok"] as ContentRights[]).map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="rights"
                checked={rights === r}
                onChange={() => setRights(r)}
              />
              {RIGHTS_LABEL[r]}
            </label>
          ))}
        </fieldset>

        {needsNote ? (
          <div className="mt-4">
            <p className="mb-2 rounded bg-wash px-3 py-2 text-xs text-ink-muted">
              {t.sources.rightsWarning}
            </p>
            <label htmlFor="rights-note" className="text-sm font-medium text-ink">
              {t.sources.rightsNoteLabel}
            </label>
            <textarea
              id="rights-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.sources.rightsNotePlaceholder}
              rows={3}
              className="mt-1 w-full rounded border border-line bg-wash p-2 text-sm"
            />
            {noteMissing ? (
              <p className="mt-1 text-xs text-accent">{t.sources.rightsNoteMissing}</p>
            ) : null}
          </div>
        ) : null}

        {save.isError ? (
          <p className="mt-2 text-sm text-accent">{(save.error as Error).message}</p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={noteMissing || save.isPending || rights === current}
            className="rounded bg-ink px-4 py-1.5 text-sm font-medium text-paper hover:bg-accent disabled:opacity-50"
          >
            {t.sources.rightsSave}
          </button>
        </div>
      </div>
    </div>
  );
}
