// Avatar hashing for shared-avatar detection. SHA-256 of the image BYTES - // an EXACT-file match (the common bot-farm pattern of reusing one avatar file),
// deliberately NOT perceptual similarity: near-duplicate (resized/re-encoded)
// detection needs an image-decoding dependency, which is deferred until listed
// and justified (CLAUDE.md: no new dependency without listing it first).
// A failed fetch/oversized image → null → the field renders "Not collected".

import { createHash } from "crypto";
import { fetchWithTimeout } from "@/lib/http";
import { cacheGet, cacheSet } from "@/lib/cache";

const MAX_BYTES = 1_000_000; // 1MB cap - avatars are small; don't pull arbitrary blobs
const HASH_TTL = 30 * 86_400_000; // an avatar file's hash is immutable per URL fetch

export async function avatarContentHash(url: string): Promise<string | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  const ck = `avhash:${url}`;
  const hit = await cacheGet<string>(ck, HASH_TTL);
  if (hit) return hit;
  try {
    const res = await fetchWithTimeout(url, { timeoutMs: 10000 });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_BYTES) return null;
    const hash = createHash("sha256").update(buf).digest("hex");
    await cacheSet(ck, hash);
    return hash;
  } catch {
    return null;
  }
}

/** Exact-file avatar match. Only meaningful when BOTH hashes were collected. */
export function sameAvatar(a?: string, b?: string): boolean {
  return !!a && !!b && a === b;
}
