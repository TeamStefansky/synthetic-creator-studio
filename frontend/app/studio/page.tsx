"use client";

// Studio (Milestones 1–4 UI shell): create a persona under an accountable
// entity, then generate disclosed assets. Every generated asset is returned
// already 'tagged' by the backend — the UI cannot bypass disclosure.
import { useState } from "react";
import { api, type Asset } from "../lib/api";
import { DisclosureBadge } from "../components/DisclosureBadge";

export default function StudioPage() {
  const [log, setLog] = useState<string[]>([]);
  const [asset, setAsset] = useState<Asset | null>(null);

  async function run() {
    try {
      const entity = await api.createEntity("Acme Brand", "brand@acme.example");
      const persona = await api.createPersona(entity.id, "Nova");
      const a = await api.generate(persona.id, "studio portrait, soft light");
      setAsset(a);
      setLog((l) => [...l, `persona ${persona.name} → asset ${a.id} (${a.disclosure_status})`]);
    } catch (e) {
      setLog((l) => [...l, `blocked: ${(e as Error).message}`]);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Studio</h1>
      <button onClick={run} className="rounded-lg bg-neutral-900 px-4 py-2 text-white">
        Create persona + generate disclosed asset
      </button>

      {asset && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">{asset.id}</span>
            <DisclosureBadge />
            <span className="text-xs text-neutral-500">status: {asset.disclosure_status}</span>
          </div>
        </div>
      )}

      <pre className="rounded-lg bg-neutral-100 p-3 text-xs text-neutral-700">
        {log.join("\n") || "No actions yet."}
      </pre>
    </div>
  );
}
