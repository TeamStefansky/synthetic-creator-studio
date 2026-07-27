"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { OpmlImportOut } from "@/lib/api/types";
import { t } from "@/lib/strings.en";

/**
 * OPML import via a plain file input + drag-and-drop. A dependency-free
 * implementation (react-dropzone was not required for this).
 */
export function OpmlImport() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const importOpml = useMutation({
    mutationFn: (opml: string) =>
      apiFetch<OpmlImportOut>("/feeds/import-opml", { method: "POST", body: { opml } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feeds"] }),
  });

  const handleFile = async (file: File) => {
    const text = await file.text();
    importOpml.mutate(text);
  };

  return (
    <div className="rounded-lg border border-line bg-paper p-5">
      <h3 className="font-headline text-lg text-ink">{t.sources.opmlHeading}</h3>
      <p className="mt-1 text-sm text-ink-muted">{t.sources.opmlHint}</p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        className={`mt-3 flex flex-col items-center justify-center rounded border-2 border-dashed px-4 py-8 text-center ${
          dragging ? "border-accent bg-wash" : "border-line"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".opml,.xml,text/x-opml"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded border border-ink px-3 py-1.5 text-sm text-ink hover:bg-ink hover:text-paper"
        >
          {t.sources.opmlChoose}
        </button>
      </div>
      {importOpml.isPending ? (
        <p className="mt-2 text-sm text-ink-muted">{t.states.loading}</p>
      ) : null}
      {importOpml.data ? (
        <p className="mt-2 text-sm text-ink-soft">
          Imported {importOpml.data.imported}, {importOpml.data.duplicates} duplicates.
        </p>
      ) : null}
      {importOpml.isError ? (
        <p className="mt-2 text-sm text-accent">{(importOpml.error as Error).message}</p>
      ) : null}
    </div>
  );
}
