// Casebook browser-local store + active-case selection. Mirrors the
// zero-config, localStorage-first model of check history: works with no server,
// and (when KV is configured) can be synced later. The ACTIVE case id is what
// makes new searches attach to a case — like the selected Chrome profile.

import { CASE_COLORS, CASEBOOK_VERSION, type Casebook } from "./types";

const KEY = "tl:casebooks";
const ACTIVE_KEY = "tl:casebook:active";
const MAX = 60;

function id(): string {
  return `cb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function listCasebooks(): Casebook[] {
  if (typeof window === "undefined") return [];
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || "[]") as Casebook[];
    return Array.isArray(all) ? all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [];
  } catch { return []; }
}

export function getCasebook(cid: string): Casebook | undefined {
  return listCasebooks().find((c) => c.id === cid);
}

function writeAll(all: Casebook[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(all.slice(0, MAX)));
}

export function createCasebook(name: string, subject?: string): Casebook {
  const all = listCasebooks();
  const now = new Date().toISOString();
  const cb: Casebook = {
    id: id(),
    name: name.trim() || "Untitled case",
    subject: subject?.trim() || undefined,
    color: CASE_COLORS[all.length % CASE_COLORS.length],
    createdAt: now,
    updatedAt: now,
    checkIds: [],
  };
  writeAll([cb, ...all]);
  setActiveCase(cb.id);
  return cb;
}

export function updateCasebook(cid: string, patch: Partial<Pick<Casebook, "name" | "subject" | "color">>): void {
  const all = listCasebooks();
  const i = all.findIndex((c) => c.id === cid);
  if (i < 0) return;
  all[i] = { ...all[i], ...patch, updatedAt: new Date().toISOString() };
  writeAll(all);
}

export function deleteCasebook(cid: string): void {
  writeAll(listCasebooks().filter((c) => c.id !== cid));
  if (getActiveCase() === cid) clearActiveCase();
}

/** Attach a check to a case (idempotent), bumping updatedAt. */
export function addCheckToCase(cid: string, checkId: string): void {
  const all = listCasebooks();
  const i = all.findIndex((c) => c.id === cid);
  if (i < 0) return;
  if (!all[i].checkIds.includes(checkId)) all[i].checkIds = [checkId, ...all[i].checkIds];
  all[i].updatedAt = new Date().toISOString();
  writeAll(all);
}

export function removeCheckFromCase(cid: string, checkId: string): void {
  const all = listCasebooks();
  const i = all.findIndex((c) => c.id === cid);
  if (i < 0) return;
  all[i].checkIds = all[i].checkIds.filter((x) => x !== checkId);
  all[i].updatedAt = new Date().toISOString();
  writeAll(all);
}

// ---- Active case (the "current profile") ---------------------------------

export function getActiveCase(): string | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(ACTIVE_KEY);
  return v && getCasebook(v) ? v : null;
}
export function setActiveCase(cid: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_KEY, cid);
  window.dispatchEvent(new CustomEvent("tl:casebook-change"));
}
export function clearActiveCase(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACTIVE_KEY);
  window.dispatchEvent(new CustomEvent("tl:casebook-change"));
}

/** Called by recordSearch: if a case is active, link the new check to it. */
export function linkCheckToActiveCase(checkId: string): void {
  const active = getActiveCase();
  if (active) addCheckToCase(active, checkId);
}

export const CASEBOOK_STORE_VERSION = CASEBOOK_VERSION;
