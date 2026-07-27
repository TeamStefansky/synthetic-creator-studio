"use client";

import { useState } from "react";
import { t } from "@/lib/strings.en";

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded border border-line px-2 py-1 text-xs text-ink-soft hover:border-ink"
    >
      {copied ? t.share.copied : (label ?? t.share.copy)}
    </button>
  );
}
