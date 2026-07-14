// Tiny two-tier cache (in-memory + on-disk JSON) keyed by domain.
// Avoids hammering the free upstream APIs when the same domain is re-analyzed.
// TTL is 24h. Disk cache survives dev-server restarts; memory cache is fastest.

import { promises as fs } from "fs";
import path from "path";
import type { Report } from "./types";

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_DIR = path.join(process.cwd(), ".cache");

interface CacheEnvelope {
  storedAt: number;
  report: Report;
}

const memory = new Map<string, CacheEnvelope>();

function keyToFile(domain: string): string {
  const safe = domain.replace(/[^a-z0-9.-]/gi, "_");
  return path.join(CACHE_DIR, `${safe}.json`);
}

function isFresh(env: CacheEnvelope): boolean {
  return Date.now() - env.storedAt < TTL_MS;
}

export async function getCached(domain: string): Promise<Report | null> {
  const mem = memory.get(domain);
  if (mem && isFresh(mem)) return mem.report;

  try {
    const raw = await fs.readFile(keyToFile(domain), "utf8");
    const env = JSON.parse(raw) as CacheEnvelope;
    if (isFresh(env)) {
      memory.set(domain, env);
      return env.report;
    }
  } catch {
    // No disk cache or unreadable — treat as miss.
  }
  return null;
}

export async function setCached(domain: string, report: Report): Promise<void> {
  const env: CacheEnvelope = { storedAt: Date.now(), report };
  memory.set(domain, env);
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(keyToFile(domain), JSON.stringify(env), "utf8");
  } catch {
    // Disk cache is best-effort; memory cache still applies.
  }
}
