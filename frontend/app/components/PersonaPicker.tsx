"use client";

import { useEffect, useState } from "react";
import { api, type Persona } from "../lib/api";

export function usePersonas() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      setPersonas(await api.listPersonas());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  return { personas, loading, error, reload };
}

export function PersonaPicker({
  personas,
  value,
  onChange,
}: {
  personas: Persona[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select a persona…</option>
      {personas.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

export function useFirstPersona(personas: Persona[]) {
  const [selected, setSelected] = useState("");
  useEffect(() => {
    if (!selected && personas.length) setSelected(personas[0].id);
  }, [personas, selected]);
  return [selected, setSelected] as const;
}
