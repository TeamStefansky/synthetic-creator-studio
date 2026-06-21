// Typed API client for the Synthetic Creator Studio backend.
// Requests go through the Next.js /api rewrite to FastAPI.

const BASE = "/api";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Surface constraint violations (C6 fail-closed) verbatim to the operator.
    throw new Error(body.detail || body.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface Entity {
  id: string;
  name: string;
  contact_email: string;
  kind: string;
  created_at: string;
}

export interface SyntheticIdentity {
  id: string;
  ai_generated: boolean;
  responsible_entity_id: string;
}

export interface Persona {
  id: string;
  name: string;
  responsible_entity_id: string;
  synthetic_identity: SyntheticIdentity;
  created_at: string;
}

export type DisclosureStatus = "pending" | "tagged" | "blocked";

export interface Asset {
  id: string;
  persona_id: string;
  kind: string;
  disclosure_status: DisclosureStatus;
  storage_uri?: string;
  provenance_manifest_uri?: string;
}

export interface Post {
  id: string;
  asset_id: string;
  platform: string;
  approval_state: string;
  external_post_id?: string;
}

export interface Dashboard {
  persona_id: string;
  metrics: Record<string, { count: number; total: number; avg: number }>;
  compliance: { compliant: boolean; published_count: number; posts: any[] };
  strategy_feedback: { best_platform: string | null; recommendations: string[] };
}

export interface TrainingImage {
  id: string;
  persona_id: string;
  content_type: string;
}

export interface LoraModel {
  id: string;
  persona_id: string;
  version: string;
  base_model: string;
  status: string;
  weights_uri?: string;
}

export interface TrainBody {
  no_real_person: boolean;
  rights_confirmed: boolean;
  subject_note?: string;
  base_model?: string;
}

async function uploadFiles(personaId: string, files: File[]): Promise<TrainingImage[]> {
  if (process.env.NEXT_PUBLIC_DEMO === "1") {
    return (require("./demo") as typeof import("./demo")).demoApi.uploadTrainingImages(personaId, files);
  }
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const res = await fetch(`${BASE}/personas/${personaId}/training-images`, { method: "POST", body: form });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
  return res.json();
}

export const assetFileUrl = (id: string) =>
  process.env.NEXT_PUBLIC_DEMO === "1"
    ? // eslint-disable-next-line @typescript-eslint/no-var-requires
      (require("./demo") as typeof import("./demo")).demoAssetSrc(id)
    : `${BASE}/assets/${id}/file`;

const liveApi = {
  constraints: () => http<Record<string, string>>("/constraints"),

  listEntities: () => http<Entity[]>("/entities"),
  createEntity: (name: string, contact_email: string, kind = "brand") =>
    http<Entity>("/entities", { method: "POST", body: JSON.stringify({ name, contact_email, kind }) }),

  listPersonas: () => http<Persona[]>("/personas"),
  createPersona: (body: {
    responsible_entity_id: string;
    name: string;
    backstory?: string;
    voice_tone?: string;
    visual_identity?: Record<string, unknown>;
  }) => http<Persona>("/personas", { method: "POST", body: JSON.stringify(body) }),
  listAssets: (personaId: string) => http<Asset[]>(`/personas/${personaId}/assets`),

  generate: (persona_id: string, prompt: string) =>
    http<Asset>("/generate", { method: "POST", body: JSON.stringify({ persona_id, prompt }) }),

  listPosts: () => http<Post[]>("/distribution/posts"),
  schedule: (asset_id: string, platform: string, caption?: string) =>
    http<Post>("/distribution/schedule", { method: "POST", body: JSON.stringify({ asset_id, platform, caption }) }),
  approve: (postId: string) => http<Post>(`/distribution/posts/${postId}/approve`, { method: "POST" }),
  publish: (postId: string) => http<Post>(`/distribution/posts/${postId}/publish`, { method: "POST" }),

  ingestMetric: (body: { persona_id: string; platform: string; metric: string; value: number }) =>
    http<{ id: string }>("/analytics/events", { method: "POST", body: JSON.stringify(body) }),
  dashboard: (personaId: string) => http<Dashboard>(`/analytics/personas/${personaId}/dashboard`),

  listTrainingImages: (personaId: string) => http<TrainingImage[]>(`/personas/${personaId}/training-images`),
  uploadTrainingImages: (personaId: string, files: File[]) => uploadFiles(personaId, files),
  train: (personaId: string, body: TrainBody) =>
    http<LoraModel>(`/personas/${personaId}/train`, { method: "POST", body: JSON.stringify(body) }),
};

// In the static GitHub Pages build (NEXT_PUBLIC_DEMO=1) the mock API backs the UI.
export const api =
  process.env.NEXT_PUBLIC_DEMO === "1"
    ? // eslint-disable-next-line @typescript-eslint/no-var-requires
      ((require("./demo") as typeof import("./demo")).demoApi as unknown as typeof liveApi)
    : liveApi;
