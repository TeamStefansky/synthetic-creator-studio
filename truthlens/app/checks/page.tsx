"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutGrid, ExternalLink, AlertTriangle } from "lucide-react";
import { fmtDate } from "@/lib/ui";
import Disclaimer from "@/components/Disclaimer";

interface Entry { id: string; verdict: string; summary: string; ts: string; }

function verdictColor(v: string) {
  if (/false/i.test(v)) return "text-risk-high border-risk-high/30";
  if (/mislead/i.test(v)) return "text-risk-unknown border-risk-unknown/30";
  if (/true/i.test(v)) return "text-risk-legit border-risk-legit/30";
  if (/opinion|satire/i.test(v)) return "text-indigo-300 border-indigo-400/30";
  return "text-gray-300 border-white/15";
}

export default function ChecksPage() {
  const [items, setItems] = useState<Entry[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/share?list=1")
      .then((r) => r.json())
      .then((d) => { setItems(d.items || []); setAvailable(d.available !== false); })
      .catch(() => setAvailable(false))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-6 w-6 text-indigo-400" />
          <h1 className="text-2xl font-bold">Recent shared checks</h1>
        </div>
        <p className="mt-1.5 max-w-2xl text-sm text-gray-400">
          Post Checks that people chose to share, newest first. Click any card to open the full result.
        </p>
      </div>

      {!loading && !available && (
        <div className="card flex items-center gap-2 text-sm text-yellow-300/90">
          <AlertTriangle className="h-4 w-4 shrink-0" /> The shared gallery isn’t set up on this deployment yet, so there’s nothing to show here. Your own checks are still saved under <Link href="/history" className="underline">History</Link>.
        </div>
      )}

      {!loading && available && items.length === 0 && (
        <div className="card text-sm text-gray-400">
          No shared checks yet. Run a <Link href="/tools/post" className="text-indigo-400">Post Check</Link> and click Share.
        </div>
      )}

      {items.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((e) => (
            <Link key={e.id} href={`/tools/post?s=${e.id}`} className="card block transition hover:-translate-y-0.5 hover:border-indigo-400/30">
              <div className={`mb-2 inline-block rounded-lg border px-2 py-0.5 text-sm font-semibold ${verdictColor(e.verdict)}`}>{e.verdict}</div>
              <p className="line-clamp-3 text-sm text-gray-300">{e.summary}</p>
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span>{fmtDate(e.ts)}</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </div>
            </Link>
          ))}
        </div>
      )}

      <Disclaimer variant="inline" />
    </div>
  );
}
