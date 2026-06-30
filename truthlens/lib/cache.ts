// Simple two-tier cache: in-memory Map + on-disk JSON files keyed by domain.
// No external DB required. Used to avoid hammering the free APIs.

import { promises as fs } from "fs";
import path from "path";
import os from "os";

const TTL_MS = 24 * 60 * 60 * 1000; // 24h

// On-disk cache dir. Use a writable temp dir so it works on read-only deploys.
const CACHE_DIR = path.join(os.tmpdir(), "truthlens-cache");

interface Envelope<T> {
  storedAt: number;
  value: T;
}

const mem = new Map<string, Envelope<any>>();

function safeKey(key: string): string {
  return key.replace(/[^a-z0-9._-]/gi, "_");
}

function isFresh(env: Envelope<any> | undefined, maxAgeMs: number): boolean {
  return !!env && Date.now() - env.storedAt < maxAgeMs;
}

export async function cacheGet<T>(
  key: string,
  maxAgeMs: number = TTL_MS,
): Promise<T | null> {
  const k = safeKey(key);
  const m = mem.get(k);
  if (isFresh(m, maxAgeMs)) return m!.value as T;

  try {
    const file = path.join(CACHE_DIR, `${k}.json`);
    const raw = await fs.readFile(file, "utf8");
    const env = JSON.parse(raw) as Envelope<T>;
    if (isFresh(env, maxAgeMs)) {
      mem.set(k, env);
      return env.value;
    }
  } catch {
    /* miss */
  }
  return null;
}

export async function cacheSet<T>(key: string, value: T): Promise<void> {
  const k = safeKey(key);
  const env: Envelope<T> = { storedAt: Date.now(), value };
  mem.set(k, env);
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(path.join(CACHE_DIR, `${k}.json`), JSON.stringify(env));
  } catch {
    // Disk cache is best-effort; memory cache still works.
  }
}
