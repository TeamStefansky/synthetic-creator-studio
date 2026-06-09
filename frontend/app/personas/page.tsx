"use client";

import { useEffect, useState } from "react";
import { Users, Plus, BadgeCheck } from "lucide-react";
import { api, type Entity } from "../lib/api";
import { usePersonas } from "../components/PersonaPicker";
import { Alert, EmptyState, PageHeader } from "../components/ui";
import { DisclosureBadge } from "../components/DisclosureBadge";

export default function PersonasPage() {
  const { personas, loading, error, reload } = usePersonas();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.listEntities().then(setEntities).catch(() => {});
  }, []);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Personas"
        subtitle="Every persona maps to a named, accountable entity and a required synthetic identity — no anonymous AI."
        action={
          <button className="btn-primary" onClick={() => setOpen((v) => !v)}>
            <Plus className="h-4 w-4" /> New persona
          </button>
        }
      />

      {open && (
        <div className="mb-6">
          <CreatePersona
            entities={entities}
            onEntities={setEntities}
            onCreated={() => {
              setOpen(false);
              reload();
            }}
          />
        </div>
      )}

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-32 w-full" />
          ))}
        </div>
      ) : personas.length === 0 ? (
        <EmptyState icon={<Users className="h-8 w-8" />} title="No personas yet" hint="Create your first disclosed AI persona to begin." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {personas.map((p) => (
            <div key={p.id} className="card p-5 transition hover:shadow-card">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand-100 to-brand-50 text-lg font-bold text-brand-700">
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <p className="font-semibold text-ink-900">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.id.slice(0, 8)}…</p>
                  </div>
                </div>
                <DisclosureBadge compact />
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-emerald-700">
                <BadgeCheck className="h-4 w-4" />
                Synthetic identity confirmed (ai_generated)
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreatePersona({
  entities,
  onEntities,
  onCreated,
}: {
  entities: Entity[];
  onEntities: (e: Entity[]) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [backstory, setBackstory] = useState("");
  const [entityId, setEntityId] = useState("");
  const [newEntity, setNewEntity] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      let eid = entityId;
      if (!eid) {
        if (!newEntity || !email) throw new Error("Provide an accountable entity (name + contact email).");
        const created = await api.createEntity(newEntity, email);
        onEntities([created, ...entities]);
        eid = created.id;
      }
      await api.createPersona({ responsible_entity_id: eid, name, backstory: backstory || undefined });
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card animate-fade-in p-6">
      <h2 className="mb-4 font-semibold text-ink-900">Create persona</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Persona name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova" />
        </div>
        <div>
          <label className="label">Accountable entity</label>
          <select className="input" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
            <option value="">+ New entity…</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        {!entityId && (
          <>
            <div>
              <label className="label">New entity name</label>
              <input className="input" value={newEntity} onChange={(e) => setNewEntity(e.target.value)} placeholder="Acme Brand" />
            </div>
            <div>
              <label className="label">Contact email</label>
              <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="brand@acme.example" />
            </div>
          </>
        )}
        <div className="sm:col-span-2">
          <label className="label">Backstory (optional)</label>
          <textarea
            className="input min-h-[80px]"
            value={backstory}
            onChange={(e) => setBackstory(e.target.value)}
            placeholder="A disclosed virtual brand ambassador…"
          />
        </div>
      </div>
      {err && <div className="mt-4"><Alert kind="error">{err}</Alert></div>}
      <div className="mt-5 flex items-center gap-3">
        <button className="btn-primary" disabled={busy || !name} onClick={submit}>
          {busy ? "Creating…" : "Create persona"}
        </button>
        <p className="text-xs text-slate-400">A synthetic identity is created atomically — required, never optional.</p>
      </div>
    </div>
  );
}
