// MinHash signatures — pure TS, deterministic (no Math.random). BigInt math keeps
// the modular arithmetic exact. Jaccard is estimated by the fraction of matching
// signature positions.

export const NUM_HASHES = 64;

const PRIME = 4294967311n; // smallest prime > 2^32
const MASK = 0xffffffffn;

function fnv1a(s: string): bigint {
  let h = 2166136261n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * 16777619n) & MASK;
  }
  return h;
}

// Deterministic (a, b) coefficients via a fixed LCG — same every run/machine.
function makeCoeffs(n: number): { a: bigint; b: bigint }[] {
  const out: { a: bigint; b: bigint }[] = [];
  let x = 123456789n;
  const next = () => { x = (1103515245n * x + 12345n) & MASK; return x; };
  for (let i = 0; i < n; i++) {
    const a = (next() % (PRIME - 1n)) + 1n;
    const b = next() % PRIME;
    out.push({ a, b });
  }
  return out;
}

const COEFFS = makeCoeffs(NUM_HASHES);

/** MinHash signature for a shingle set. Empty set → all-zero signature. */
export function minhash(shingles: string[]): number[] {
  if (!shingles.length) return new Array(NUM_HASHES).fill(0);
  const hs = shingles.map(fnv1a);
  return COEFFS.map(({ a, b }) => {
    let m = PRIME;
    for (const h of hs) {
      const v = (a * h + b) % PRIME;
      if (v < m) m = v;
    }
    return Number(m);
  });
}

/** Estimated Jaccard similarity in [0,1] from two signatures. */
export function jaccard(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let eq = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) eq++;
  return eq / a.length;
}
