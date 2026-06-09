"use client";

import { useEffect, useState } from "react";
import { Wand2, ImageIcon, ShieldCheck } from "lucide-react";
import { api, assetFileUrl, type Asset } from "../lib/api";
import { PersonaPicker, usePersonas, useFirstPersona } from "../components/PersonaPicker";
import { Alert, EmptyState, PageHeader, StatusChip } from "../components/ui";
import { DisclosureBadge } from "../components/DisclosureBadge";

export default function StudioPage() {
  const { personas } = usePersonas();
  const [persona, setPersona] = useFirstPersona(personas);
  const [prompt, setPrompt] = useState("studio portrait, soft window light, warm tones");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!persona) {
      setAssets([]);
      return;
    }
    api.listAssets(persona).then(setAssets).catch(() => {});
  }, [persona]);

  async function generate() {
    if (!persona) return;
    setBusy(true);
    setErr(null);
    try {
      const asset = await api.generate(persona, prompt);
      setAssets((a) => [asset, ...a]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Studio"
        subtitle="Generate per-persona assets. Every emitted asset is visibly labeled and provenance-stamped before it can be saved."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
        <section className="card h-fit p-6">
          <label className="label">Persona</label>
          <PersonaPicker personas={personas} value={persona} onChange={setPersona} />

          <label className="label mt-4">Prompt</label>
          <textarea className="input min-h-[120px]" value={prompt} onChange={(e) => setPrompt(e.target.value)} />

          <button className="btn-primary mt-4 w-full" disabled={!persona || busy} onClick={generate}>
            <Wand2 className="h-4 w-4" /> {busy ? "Generating…" : "Generate disclosed asset"}
          </button>

          {err && <div className="mt-4"><Alert kind="error">{err}</Alert></div>}

          <div className="mt-5 flex items-start gap-2 rounded-xl bg-brand-50 p-3 text-xs text-brand-700">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Prompts are screened for real-person impersonation (C4). Output carries C2PA-style provenance + an AI label (C1).
          </div>
        </section>

        <section>
          {!persona ? (
            <EmptyState icon={<Wand2 className="h-8 w-8" />} title="Pick a persona" hint="Select a persona to generate and view its assets." />
          ) : assets.length === 0 ? (
            <EmptyState icon={<ImageIcon className="h-8 w-8" />} title="No assets yet" hint="Generate your first disclosed asset." />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {assets.map((a) => (
                <figure key={a.id} className="card overflow-hidden">
                  <div className="relative aspect-square bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={assetFileUrl(a.id)} alt="generated asset" className="h-full w-full object-cover" />
                    <div className="absolute left-2 top-2">
                      <DisclosureBadge compact />
                    </div>
                  </div>
                  <figcaption className="flex items-center justify-between gap-2 p-3">
                    <span className="truncate font-mono text-xs text-slate-400">{a.id.slice(0, 8)}…</span>
                    <StatusChip status={a.disclosure_status} />
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
