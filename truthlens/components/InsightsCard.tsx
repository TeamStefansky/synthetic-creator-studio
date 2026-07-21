"use client";

import { useState } from "react";
import { MessageSquare, Loader2, Sparkles, Send } from "lucide-react";
import type { Report } from "@/lib/types";

const SUGGESTIONS = [
  "Who is likely behind this site?",
  "Why did it get this risk score?",
  "Is there evidence of a coordinated network?",
  "What are the strongest red flags?",
  "Where is it really hosted?",
];

export default function InsightsCard({ report }: { report: Report }) {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const ask = async (question: string) => {
    const query = question.trim();
    if (!query) return;
    setLoading(true);
    setAnswer("");
    try {
      const r = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report, question: query }),
      });
      const data = await r.json();
      setAnswer(data.answer || data.error || "No answer.");
    } catch (e: any) {
      setAnswer(`Request failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-brand-soft" />
        <h2 className="text-lg font-semibold">Insights - ask this report</h2>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything about this site…"
          className="w-full rounded-xl border border-white/15 bg-bg-elev px-4 py-2.5 text-sm outline-none transition focus:border-brand"
        />
        <button type="submit" className="btn shrink-0 px-4 py-2.5" disabled={loading || !q.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => { setQ(s); ask(s); }}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-ink transition hover:border-white/25 hover:bg-white/[0.06]"
          >
            {s}
          </button>
        ))}
      </div>

      {(loading || answer) && (
        <div className="mt-4 rounded-xl border border-white/10 bg-bg-elev p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-ink-secondary">
              <Sparkles className="h-4 w-4 animate-pulse text-brand-soft" /> Thinking…
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{answer}</p>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-ink-secondary">Answers are grounded only in this report&rsquo;s data - indicators, not verdicts.</p>
    </div>
  );
}
