// Check history. Every check is persisted automatically - no "save" button.
// Anonymous users: browser localStorage (works with zero config). When a KV
// store is configured, checks are also synced to a shared server-side feed.

import type { CheckType } from "./detect";

export interface CheckRecord {
  id: string;
  type: CheckType;
  input: string;
  headline: string;
  level?: string; // Low/Medium/High/Unknown
  result?: any; // the raw API result, so the check re-opens without re-running
  createdAt: string;
}

const KEY = "tl:checks";
const MAX = 100;

export function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function listLocal(): CheckRecord[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
export function getLocal(id: string): CheckRecord | undefined {
  return listLocal().find((c) => c.id === id);
}
export function saveLocal(rec: CheckRecord): void {
  if (typeof window === "undefined") return;
  const all = [rec, ...listLocal().filter((c) => c.id !== rec.id)].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(all));
}
export function removeLocal(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(listLocal().filter((c) => c.id !== id)));
}

/** Best-effort sync to the shared KV feed (no-op when KV isn't configured). */
export async function syncShared(rec: CheckRecord): Promise<void> {
  try {
    await fetch("/api/checks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rec),
    });
  } catch { /* best-effort */ }
}
