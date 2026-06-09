"use client";

import { useEffect, useState } from "react";
import { Activity, TrendingUp, Heart, Eye, ShieldCheck, Lightbulb } from "lucide-react";
import { api, type Dashboard } from "./lib/api";
import { PersonaPicker, usePersonas, useFirstPersona } from "./components/PersonaPicker";
import { Alert, EmptyState, PageHeader } from "./components/ui";
import { DisclosureBadge } from "./components/DisclosureBadge";

const METRICS = [
  { key: "reach", label: "Reach", icon: Eye, fmt: (v: number) => Math.round(v).toLocaleString() },
  { key: "engagement", label: "Engagement", icon: Activity, fmt: (v: number) => `${(v * 100).toFixed(1)}%` },
  { key: "growth", label: "Growth", icon: TrendingUp, fmt: (v: number) => `${(v * 100).toFixed(1)}%` },
  { key: "sentiment", label: "Sentiment", icon: Heart, fmt: (v: number) => v.toFixed(2) },
];

export default function DashboardPage() {
  const { personas, loading: pLoading } = usePersonas();
  const [persona, setPersona] = useFirstPersona(personas);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!persona) return;
    setLoading(true);
    api
      .dashboard(persona)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [persona]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Dashboard"
        subtitle="Reach, engagement, growth and sentiment — with a compliance view confirming every published asset carried disclosure."
        action={<div className="w-full sm:w-64"><PersonaPicker personas={personas} value={persona} onChange={setPersona} /></div>}
      />

      {!pLoading && personas.length === 0 && (
        <EmptyState
          icon={<ShieldCheck className="h-8 w-8" />}
          title="No personas yet"
          hint="Create a persona in the Personas tab to start tracking performance and compliance."
        />
      )}

      {error && <Alert kind="error">{error}</Alert>}

      {persona && (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {METRICS.map(({ key, label, icon: Icon, fmt }) => {
              const m = data?.metrics?.[key];
              return (
                <div key={key} className="card p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-500">{label}</span>
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
                      <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
                    </span>
                  </div>
                  <div className="mt-3 text-3xl font-bold text-ink-900">
                    {loading ? <div className="skeleton h-8 w-20" /> : m ? fmt(m.avg) : "—"}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{m ? `${m.count} event(s)` : "no data yet"}</div>
                </div>
              );
            })}
          </section>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="card p-6">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-brand-600" />
                <h2 className="font-semibold text-ink-900">Compliance</h2>
                <DisclosureBadge compact className="ml-auto" />
              </div>
              {data ? (
                <div className="flex items-center gap-4">
                  <div
                    className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-2xl ${
                      data.compliance.compliant ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                    }`}
                  >
                    {data.compliance.compliant ? "✓" : "!"}
                  </div>
                  <p className="text-sm text-slate-600">
                    <strong className="text-ink-900">
                      {data.compliance.compliant ? "All clear." : "Action needed."}
                    </strong>{" "}
                    {data.compliance.published_count} published asset(s) checked — the gate refuses any post lacking valid
                    provenance and a visible label.
                  </p>
                </div>
              ) : (
                <div className="skeleton h-16 w-full" />
              )}
            </section>

            <section className="card p-6">
              <div className="mb-3 flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-amber-500" />
                <h2 className="font-semibold text-ink-900">Strategy feedback</h2>
              </div>
              {data?.strategy_feedback?.recommendations?.length ? (
                <ul className="space-y-2">
                  {data.strategy_feedback.best_platform && (
                    <li className="text-sm text-slate-600">
                      Best platform: <strong className="capitalize text-ink-900">{data.strategy_feedback.best_platform}</strong>
                    </li>
                  )}
                  {data.strategy_feedback.recommendations.map((r, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-600">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                      {r}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">Ingest analytics events to generate strategy recommendations.</p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
