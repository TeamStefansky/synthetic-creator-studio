// Static-demo data + mock API (no backend).
// Active when NEXT_PUBLIC_DEMO=1 (the GitHub Pages build). Mirrors the real
// API surface with seeded, in-memory data so the studio is fully clickable as
// a static site. Mutations persist for the browser session.
import type { Asset, Dashboard, Entity, Persona, Post } from "./api";

export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

const uid = () => Math.random().toString(36).slice(2, 10);
const PALETTES: Record<string, [number, number, number]> = {
  Nova: [40, 120, 200],
  Kai: [200, 90, 60],
  Lumi: [120, 80, 200],
};

// Deterministic labeled "image" for an asset id — an SVG data URI that mirrors
// the pixel-level AI·SYNTHETIC label the real backend bakes in.
export function demoAssetSrc(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const hue2 = (hue + 40) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue},70%,60%)"/>
    <stop offset="1" stop-color="hsl(${hue2},65%,42%)"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <circle cx="256" cy="200" r="92" fill="rgba(255,255,255,.22)"/>
  <rect x="150" y="312" width="212" height="150" rx="40" fill="rgba(255,255,255,.18)"/>
  <g transform="translate(16,470)">
    <rect x="0" y="-26" width="168" height="30" rx="15" fill="rgba(0,0,0,.7)"/>
    <text x="14" y="-5" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="700" fill="#fff">AI · SYNTHETIC</text>
  </g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function makePersona(name: string, entityId: string): Persona {
  return {
    id: uid(),
    name,
    responsible_entity_id: entityId,
    synthetic_identity: { id: uid(), ai_generated: true, responsible_entity_id: entityId },
    created_at: new Date().toISOString(),
  };
}

function makeAsset(personaId: string): Asset {
  return { id: uid(), persona_id: personaId, kind: "image", disclosure_status: "tagged" };
}

// ---- seeded store ----------------------------------------------------------
const entity: Entity = {
  id: uid(),
  name: "Aurora Labs",
  contact_email: "brand@aurora.example",
  kind: "brand",
  created_at: new Date().toISOString(),
};
const entities: Entity[] = [entity];
const personas: Persona[] = Object.keys(PALETTES).map((n) => makePersona(n, entity.id));
const assets: Record<string, Asset[]> = {};
const posts: Post[] = [];
for (const p of personas) {
  assets[p.id] = Array.from({ length: 4 }, () => makeAsset(p.id));
  posts.push({
    id: uid(),
    asset_id: assets[p.id][0].id,
    platform: Math.random() > 0.5 ? "instagram" : "tiktok",
    approval_state: "published",
    external_post_id: `demo_${uid()}`,
  });
}

const wait = <T>(v: T, ms = 250) => new Promise<T>((r) => setTimeout(() => r(v), ms));

function dashboardFor(personaId: string): Dashboard {
  const seed = personaId.charCodeAt(0) + personaId.length;
  const r = (n: number) => Math.round(n);
  const mk = (avg: number) => ({ count: 2, total: avg * 2, avg });
  const eng = 0.02 + (seed % 5) / 100;
  return {
    persona_id: personaId,
    metrics: {
      reach: mk(r(18000 + (seed % 9) * 1500)),
      engagement: mk(Number(eng.toFixed(3))),
      growth: mk(0.03),
      sentiment: mk(0.45),
    },
    compliance: { compliant: true, published_count: posts.filter((x) => assets[personaId]?.some((a) => a.id === x.asset_id)).length, posts: [] },
    strategy_feedback: {
      best_platform: seed % 2 ? "tiktok" : "instagram",
      recommendations: [
        `Double down on '${seed % 2 ? "tiktok" : "instagram"}' — highest cumulative engagement.`,
        "Maintain disclosure-first captions; compliance is at 100%.",
      ],
    },
  };
}

export const demoApi = {
  constraints: async () => wait({ C1: "Disclosure is core", C2: "No publish without disclosure" }),
  listEntities: async () => wait([...entities]),
  createEntity: async (name: string, contact_email: string, kind = "brand") => {
    const e: Entity = { id: uid(), name, contact_email, kind, created_at: new Date().toISOString() };
    entities.unshift(e);
    return wait(e);
  },
  listPersonas: async () => wait([...personas]),
  createPersona: async (body: { responsible_entity_id: string; name: string }) => {
    const p = makePersona(body.name, body.responsible_entity_id);
    personas.unshift(p);
    assets[p.id] = [];
    return wait(p);
  },
  listAssets: async (personaId: string) => wait([...(assets[personaId] ?? [])]),
  generate: async (persona_id: string, _prompt: string) => {
    const a = makeAsset(persona_id);
    (assets[persona_id] ??= []).unshift(a);
    return wait(a, 600);
  },
  listPosts: async () => wait([...posts]),
  schedule: async (asset_id: string, platform: string) => {
    const post: Post = { id: uid(), asset_id, platform, approval_state: "draft" };
    posts.unshift(post);
    return wait(post);
  },
  approve: async (postId: string) => {
    const p = posts.find((x) => x.id === postId)!;
    p.approval_state = "approved";
    return wait(p);
  },
  publish: async (postId: string) => {
    const p = posts.find((x) => x.id === postId)!;
    p.approval_state = "published";
    p.external_post_id = `demo_${uid()}`;
    return wait(p, 400);
  },
  ingestMetric: async () => wait({ id: uid() }),
  dashboard: async (personaId: string) => wait(dashboardFor(personaId)),
};
