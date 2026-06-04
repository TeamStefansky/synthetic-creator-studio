// Thin API client for the Synthetic Creator Studio backend.
// All calls go through the Next.js /api rewrite to FastAPI.

const BASE = "/api";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Surface constraint violations (C6 fail-closed) verbatim to the operator.
    throw new Error(body.detail || body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface Persona {
  id: string;
  name: string;
  responsible_entity_id: string;
  synthetic_identity: { id: string; ai_generated: boolean };
}

export interface Asset {
  id: string;
  persona_id: string;
  kind: string;
  disclosure_status: "pending" | "tagged" | "blocked";
  storage_uri?: string;
}

export interface Dashboard {
  persona_id: string;
  metrics: Record<string, { count: number; total: number; avg: number }>;
  compliance: { compliant: boolean; published_count: number };
  strategy_feedback: { best_platform: string | null; recommendations: string[] };
}

export interface LoraModel {
  id: string;
  persona_id: string;
  version: string;
  base_model: string;
  status: string;
  weights_uri?: string;
}

export const api = {
  constraints: () => http<Record<string, string>>("/constraints"),
  createEntity: (name: string, contact_email: string) =>
    http<{ id: string }>("/entities", { method: "POST", body: JSON.stringify({ name, contact_email }) }),
  createPersona: (responsible_entity_id: string, name: string) =>
    http<Persona>("/personas", { method: "POST", body: JSON.stringify({ responsible_entity_id, name }) }),
  generate: (persona_id: string, prompt: string) =>
    http<Asset>("/generate", { method: "POST", body: JSON.stringify({ persona_id, prompt }) }),
  compliance: (persona_id: string) =>
    http<{ compliant: boolean; published_count: number }>(`/analytics/personas/${persona_id}/compliance`),
  dashboard: (persona_id: string) =>
    http<Dashboard>(`/analytics/personas/${persona_id}/dashboard`),
  trainLora: (persona_id: string, dataset_uri: string) =>
    http<LoraModel>("/lora/train", {
      method: "POST",
      body: JSON.stringify({ persona_id, dataset_uri }),
    }),
};
