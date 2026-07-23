import { Plug, CheckCircle2, Circle } from "lucide-react";
import { connectionSummary } from "@/lib/connections";
import Disclaimer from "@/components/Disclaimer";

// Live connection status - the system reports which integrations are connected
// (keyless, or their env vars are set on this deployment) vs. not, with the
// exact env var + where to get it for anything still missing. Server-rendered
// from the real process.env, so it is always accurate for this environment.

export const dynamic = "force-dynamic"; // reflect the current env, never cached
export const metadata = { title: "Connections & status | TruthLens" };

export default function StatusPage() {
  const { total, connected, byCategory } = connectionSummary();
  const pct = Math.round((connected / total) * 100);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Plug className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">Connections <span className="gradient-text">& status</span></h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          Live view of every data source and layer. Keyless sources are always on; key-gated ones
          show connected when their environment variable is set on this deployment. Anything not
          connected renders as a visible &ldquo;not connected&rdquo; state in the product - never faked.
        </p>
      </div>

      <div className="card">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">{connected} / {total} connected</span>
          <span className="text-ink-secondary">{pct}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-white/5">
          <div className="h-2 rounded-full bg-gradient-brand" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {byCategory.map((g) => (
        <div key={g.category} className="card">
          <div className="label-muted mb-3">{g.category}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {g.items.map((i) => (
              <div key={i.key} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2">
                {i.connected ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-risk-legit" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className={i.connected ? "text-ink" : "text-ink-secondary"}>{i.label}</span>
                    {i.keyless && <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">keyless</span>}
                    {i.note && <span className="rounded bg-yellow-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-yellow-200/80">{i.note}</span>}
                  </div>
                  {!i.connected && (
                    <div className="mt-0.5 text-xs text-ink-secondary">
                      set <span className="font-mono text-ink">{i.missing.join(i.anyOf ? " or " : " + ")}</span>
                      {i.getUrl ? <> · <span className="text-ink-muted">{i.getUrl}</span></> : null}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <Disclaimer variant="inline" />
    </div>
  );
}
