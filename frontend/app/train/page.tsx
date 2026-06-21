"use client";

// Train (KREA-style): upload reference images of a synthetic/owned character,
// then train a per-persona model. Gated by the C4 non-impersonation attestation
// — the same rule the backend enforces server-side.
import { useEffect, useState } from "react";
import { GraduationCap, Upload, ShieldAlert, CheckCircle2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { api, type TrainingImage } from "../lib/api";
import { PersonaPicker, usePersonas, useFirstPersona } from "../components/PersonaPicker";
import { Alert, EmptyState, PageHeader, StatusChip } from "../components/ui";

export default function TrainPage() {
  const { personas } = usePersonas();
  const [persona, setPersona] = useFirstPersona(personas);
  const [images, setImages] = useState<TrainingImage[]>([]);
  const [noReal, setNoReal] = useState(false);
  const [rights, setRights] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    setModel(null);
    if (persona) api.listTrainingImages(persona).then(setImages).catch(() => setImages([]));
    else setImages([]);
  }, [persona]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!persona || !e.target.files?.length) return;
    setMsg(null);
    try {
      setImages(await api.uploadTrainingImages(persona, Array.from(e.target.files)));
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
  }

  async function train() {
    if (!persona) return;
    setBusy(true);
    setMsg(null);
    try {
      const m = await api.train(persona, { no_real_person: noReal, rights_confirmed: rights, subject_note: note || undefined });
      setModel(m.weights_uri || m.version);
      setMsg({ kind: "success", text: "Training complete — the persona now generates from your reference images." });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const canTrain = !!persona && images.length >= 3 && noReal && rights && !busy;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Train a persona"
        subtitle="Upload reference images of a synthetic or owned character; the persona learns to generate consistently from them."
        action={<div className="w-full sm:w-64"><PersonaPicker personas={personas} value={persona} onChange={setPersona} /></div>}
      />

      {/* C4 guardrail notice */}
      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <p className="text-sm text-amber-800">
          <strong>No real people.</strong> You may only train on a synthetic character or imagery you own or have
          licensed. Training on a real person&apos;s likeness is refused (C4). Outputs always stay labeled as AI.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Dataset */}
        <section className="card p-6">
          <h2 className="mb-3 font-semibold text-ink-900">Reference images</h2>
          {!persona ? (
            <EmptyState icon={<GraduationCap className="h-8 w-8" />} title="Pick a persona" />
          ) : (
            <>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center hover:border-brand-400">
                <Upload className="h-7 w-7 text-slate-400" />
                <span className="text-sm font-medium text-slate-600">Click to upload images (PNG/JPEG/WebP)</span>
                <span className="text-xs text-slate-400">At least 3 to train</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={onUpload} />
              </label>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate-500">{images.length} image(s) in dataset</span>
                {images.length >= 3 ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> enough to train</span>
                ) : (
                  <span className="text-amber-600">need {3 - images.length} more</span>
                )}
              </div>
              {images.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {images.map((im) => (
                    <span key={im.id} className="grid h-12 w-12 place-items-center rounded-lg bg-gradient-to-br from-brand-100 to-brand-50 text-[10px] font-medium text-brand-700">IMG</span>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* Attestation + train */}
        <section className="card h-fit p-6">
          <h2 className="mb-3 font-semibold text-ink-900">Attestation</h2>
          <label className="mb-3 flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={noReal} onChange={(e) => setNoReal(e.target.checked)} />
            The subject is not a real person&apos;s likeness (it is synthetic / a character).
          </label>
          <label className="mb-3 flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={rights} onChange={(e) => setRights(e.target.checked)} />
            I own or have licensed these reference images.
          </label>
          <input className="input mb-4" placeholder="Subject note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

          <button className="btn-primary w-full" disabled={!canTrain} onClick={train}>
            <GraduationCap className="h-4 w-4" /> {busy ? "Training…" : "Train persona"}
          </button>

          {msg && <div className="mt-4"><Alert kind={msg.kind}>{msg.text}</Alert></div>}

          {model && (
            <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
              <div className="flex items-center gap-2"><StatusChip status="ready" /> model trained</div>
              <Link href="/studio" className="mt-2 inline-flex items-center gap-1 font-medium text-brand-700">
                Generate in Studio <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
