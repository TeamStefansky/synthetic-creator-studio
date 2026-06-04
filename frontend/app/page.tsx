"use client";

// Analytics / compliance dashboard (Milestone 7), wired to live backend data.
import { useState } from "react";
import { api, type Dashboard } from "./lib/api";
import { DisclosureBadge } from "./components/DisclosureBadge";

export default function DashboardPage() {
  const [personaId, setPersonaId] = useState("");
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setData(await api.dashboard(personaId.trim()));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const metric = (k: string) => data?.metrics?.[k]?.avg ?? "—";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-neutral-600">
        Per-persona reach, engagement, growth and sentiment — plus a compliance
        view confirming every published asset carried valid disclosure.
      </p>

      <div className="flex gap-2">
        <input
          value={personaId}
          onChange={(e) => setPersonaId(e.target.value)}
          placeholder="persona id"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <button onClick={load} className="rounded-lg bg-neutral-900 px-4 py-2 text-white">
          Load
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {["reach", "engagement", "sentiment"].map((m) => (
          <div key={m} className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="text-sm capitalize text-neutral-500">{m}</div>
            <div className="mt-2 text-2xl font-bold">{metric(m)}</div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="font-semibold">Compliance</h2>
          <DisclosureBadge />
        </div>
        {data ? (
          <p className="text-sm text-neutral-700">
            {data.compliance.compliant ? "✅ All" : "⚠️ Not all"} of{" "}
            {data.compliance.published_count} published asset(s) carried valid disclosure.
          </p>
        ) : (
          <p className="text-sm text-neutral-600">Load a persona to view compliance.</p>
        )}
      </section>

      {data?.strategy_feedback && (
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">Strategy feedback</h2>
          {data.strategy_feedback.best_platform && (
            <p className="text-sm text-neutral-700">
              Best platform: <strong>{data.strategy_feedback.best_platform}</strong>
            </p>
          )}
          <ul className="mt-1 list-disc pl-5 text-sm text-neutral-700">
            {data.strategy_feedback.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
