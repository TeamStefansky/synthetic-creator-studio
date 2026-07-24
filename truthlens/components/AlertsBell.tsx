"use client";

// Global in-app alerts indicator. Lives in the root layout, so escalation alerts
// from Continuous Brand Watch surface ON EVERY PAGE - a bell with a live count +
// a dropdown of recent alerts, each linking to that brand's dashboard. Polls the
// same server-side alerts feed (/api/watch) the Monitor uses; renders nothing
// when there is nothing to show (no KV, or no alerts) so it never clutters.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import { fmtDate } from "@/lib/ui";

interface WatchAlert { id: string; entity: string; status: string; score: number | null; title: string; body: string; at: string }
const STATUS_COLOR: Record<string, string> = {
  UNDER_ATTACK: "text-risk-high",
  ELEVATED: "text-risk-unknown",
  CALM: "text-risk-legit",
};

const SEEN_KEY = "tl:alerts:seen"; // last-seen alert id, to compute the "new" badge

export default function AlertsBell() {
  const [alerts, setAlerts] = useState<WatchAlert[]>([]);
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const seenRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/watch", { cache: "no-store" });
      const d = await r.json();
      setConnected(!!d.connected);
      setAlerts(Array.isArray(d.alerts) ? d.alerts : []);
    } catch { /* keep last state */ }
  }, []);

  useEffect(() => {
    try { seenRef.current = localStorage.getItem(SEEN_KEY); } catch { /* ignore */ }
    load();
    const id = setInterval(load, 60_000); // poll every minute
    return () => clearInterval(id);
  }, [load]);

  // Nothing to surface -> render nothing (no KV connected, or no alerts yet).
  if (!connected || alerts.length === 0) return null;

  const newestId = alerts[0]?.id;
  const unseen = seenRef.current !== newestId ? alerts.findIndex((a) => a.id === seenRef.current) : 0;
  const newCount = unseen < 0 ? alerts.length : unseen;

  const markSeen = () => {
    seenRef.current = newestId;
    try { localStorage.setItem(SEEN_KEY, newestId || ""); } catch { /* ignore */ }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 no-print">
      {open && (
        <div className="mb-2 w-80 max-w-[90vw] rounded-xl border border-white/15 bg-bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold"><Bell className="h-4 w-4 text-brand-soft" /> Alerts</div>
            <button onClick={() => setOpen(false)} className="rounded p-1 text-ink-secondary hover:bg-white/5" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
          <ul className="max-h-96 divide-y divide-white/5 overflow-y-auto">
            {alerts.slice(0, 12).map((a) => (
              <li key={a.id} className="px-3 py-2">
                <Link href={`/tools/mentions?entity=${encodeURIComponent(a.entity)}`} onClick={() => setOpen(false)} className="block hover:underline">
                  <div className={`text-sm font-medium ${STATUS_COLOR[a.status] || "text-ink"}`}>{a.title}</div>
                </Link>
                {a.body && <div className="mt-0.5 text-xs text-ink-secondary">{a.body}</div>}
                <div className="mt-0.5 text-[11px] text-ink-muted">{fmtDate(a.at)}</div>
              </li>
            ))}
          </ul>
          <Link href="/monitor" onClick={() => setOpen(false)} className="block border-t border-white/10 px-3 py-2 text-center text-xs text-brand-soft hover:underline">
            Open Monitor
          </Link>
        </div>
      )}
      <button
        onClick={() => { setOpen((v) => !v); if (!open) markSeen(); }}
        className="relative grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-bg-elev shadow-glow transition hover:scale-105"
        aria-label={`${alerts.length} monitoring alert(s)`}
      >
        <Bell className="h-5 w-5 text-brand-soft" />
        {newCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-risk-high px-1 text-[11px] font-bold text-white">
            {newCount > 9 ? "9+" : newCount}
          </span>
        )}
      </button>
    </div>
  );
}
