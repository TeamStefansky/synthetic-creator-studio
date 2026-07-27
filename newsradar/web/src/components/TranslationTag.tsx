"use client";

import { useState } from "react";
import { isRtl, languageName } from "@/lib/format";
import { t } from "@/lib/strings.en";

type Props = {
  sourceLang: string | null | undefined;
  headlineOriginal: string | null | undefined;
  translationStatus: string;
};

/**
 * Shown when the source language is not English. Reveals `headline_original` in
 * the source script on hover/tap — RTL-correct via dir="auto" (so Hebrew/Arabic
 * render right-to-left inside the LTR page). Only rendered for genuinely
 * translated content (status "ok"), never for passthrough English.
 */
export function TranslationTag({ sourceLang, headlineOriginal, translationStatus }: Props) {
  const [open, setOpen] = useState(false);
  if (!sourceLang || sourceLang.toLowerCase() === "en") return null;
  if (translationStatus === "passthrough") return null;

  const label = t.translation.tag(languageName(sourceLang));
  const rtl = isRtl(sourceLang);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-full border border-line bg-wash px-2 py-0.5 text-xs text-ink-muted hover:border-accent-soft hover:text-accent"
      >
        <span aria-hidden>🌐</span>
        {label}
      </button>
      {open && headlineOriginal ? (
        <span
          role="tooltip"
          dir="auto"
          lang={sourceLang}
          className={`absolute z-20 mt-1 block w-max max-w-xs rounded border border-line bg-paper px-3 py-2 text-sm text-ink shadow-lg ${
            rtl ? "right-0 text-right" : "left-0 text-left"
          }`}
        >
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-ink-faint">
            {t.translation.originalHeadline}
          </span>
          {headlineOriginal}
        </span>
      ) : null}
    </span>
  );
}
