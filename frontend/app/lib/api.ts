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
};
