"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";

/** Landing-page URL input. Validates, then routes to /report?url=... */
export default function UrlInput() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const raw = value.trim();
    if (!raw) {
      setError("Please paste a URL to analyze.");
      return;
    }

    // Light client-side validation; the server normalizes authoritatively.
    let candidate = raw;
    if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
    try {
      const u = new URL(candidate);
      if (!u.hostname.includes(".")) throw new Error();
    } catch {
      setError("That doesn't look like a valid URL.");
      return;
    }

    setSubmitting(true);
    router.push(`/report?url=${encodeURIComponent(candidate)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            inputMode="url"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="example.com or https://example.com/article"
            className="w-full rounded-xl border border-surface-border bg-surface-card py-4 pl-11 pr-4 text-base text-slate-100 placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            aria-label="Website URL to analyze"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-4 text-base font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-70"
        >
          {submitting ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Search className="h-5 w-5" />
          )}
          Analyze
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-band-red">{error}</p>}
    </form>
  );
}
