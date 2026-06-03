// Analytics / compliance dashboard (Milestone 7, UI shell).
import { DisclosureBadge } from "./components/DisclosureBadge";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-neutral-600">
        Per-persona reach, engagement, growth and sentiment — plus a compliance
        view confirming every published asset carried valid disclosure.
      </p>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {["Reach", "Engagement", "Sentiment"].map((m) => (
          <div key={m} className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="text-sm text-neutral-500">{m}</div>
            <div className="mt-2 text-2xl font-bold">—</div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="font-semibold">Compliance</h2>
          <DisclosureBadge />
        </div>
        <p className="text-sm text-neutral-600">
          The backend refuses to publish any asset lacking valid C2PA provenance
          and a visible label. This panel reads <code>/analytics/.../compliance</code>.
        </p>
      </section>
    </div>
  );
}
