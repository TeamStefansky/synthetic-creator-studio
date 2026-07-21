"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export default function UrlInput() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = url.trim();
    if (!v) {
      setError("Enter a URL to analyze.");
      return;
    }
    // light client-side validation; server normalizes properly
    const candidate = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    try {
      const u = new URL(candidate);
      if (!u.hostname.includes(".")) throw new Error();
    } catch {
      setError("That doesn't look like a valid URL.");
      return;
    }
    router.push(`/report?url=${encodeURIComponent(v)}`);
  };

  return (
    <form onSubmit={submit} className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError("");
          }}
          placeholder="https://example-news-site.com/article"
          className="w-full rounded-xl border border-white/15 bg-bg-card px-4 py-3 text-base outline-none transition focus:border-brand"
          autoFocus
          inputMode="url"
        />
        <button type="submit" className="btn shrink-0">
          <Search className="h-4 w-4" /> Analyze
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-risk-high">{error}</p>}
    </form>
  );
}
