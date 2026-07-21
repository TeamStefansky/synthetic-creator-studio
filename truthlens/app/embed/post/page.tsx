"use client";

import { STATUS, TOKENS } from "@/lib/design-tokens";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { PostCheckResult, PostVerdict } from "@/lib/types";

function color(v: PostVerdict) {
  switch (v) {
    case "Likely False": return STATUS.high;
    case "Misleading": return STATUS.unknown;
    case "Likely True": return STATUS.legit;
    case "Opinion or Satire": return TOKENS.primary;
    default: return TOKENS.textSecondary;
  }
}

function EmbedInner() {
  const id = useSearchParams().get("s");
  const [res, setRes] = useState<PostCheckResult | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    document.body.classList.add("embed-mode");
    return () => document.body.classList.remove("embed-mode");
  }, []);

  useEffect(() => {
    if (!id) { setErr("No result id."); return; }
    fetch(`/api/share?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => (d.result ? setRes(d.result) : setErr(d.error || "Not found")))
      .catch(() => setErr("Could not load result."));
  }, [id]);

  if (err) return <div className="p-4 text-sm text-ink-secondary">{err}</div>;
  if (!res) return <div className="p-4 text-sm text-ink-secondary">Loading…</div>;

  return (
    <div className="mx-auto max-w-md p-3">
      <div className="rounded-xl border border-white/10 bg-bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-brand text-[11px] font-bold text-white">T</span>
          <span className="text-xs font-medium text-ink-secondary">TruthLens · Post Check</span>
        </div>
        <div className="text-lg font-bold" style={{ color: color(res.verdict) }}>{res.verdict}</div>
        <div className="mb-2 text-xs text-ink-secondary">Confidence: {res.confidence}</div>
        <p className="text-sm text-ink">{res.summary}</p>
        {res.sources.length > 0 && (
          <a href={res.sources[0].url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-brand-soft hover:underline">
            {res.sources.length} source(s) →
          </a>
        )}
        <div className="mt-3 border-t border-white/10 pt-2 text-[11px] text-ink-secondary">
          Indicators, not a verdict · powered by TruthLens
        </div>
      </div>
    </div>
  );
}

export default function EmbedPostPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-ink-secondary">Loading…</div>}>
      <EmbedInner />
    </Suspense>
  );
}
