import { describe, it, expect } from "vitest";
import {
  perceptualHash,
  dctHash,
  fingerprintOf,
  hammingHex,
  clusterPersonas,
  temporalConsistency,
  aggregateFrameScores,
  buildAssessment,
  MIN_FRAMES,
  DCT_SAMPLE_SIDE,
  TEMPORAL_MIN_FRAMES,
} from "@/lib/media-check";

describe("perceptual persona fingerprint", () => {
  it("hashes an 8x8 grayscale sample to 16 hex chars, deterministically", () => {
    const g = Array.from({ length: 64 }, (_, i) => i * 4);
    const h = perceptualHash(g);
    expect(h).toHaveLength(16);
    expect(perceptualHash(g)).toBe(h); // deterministic
  });
  it("rejects a malformed sample", () => {
    expect(perceptualHash([1, 2, 3])).toBe("");
  });
  it("identical samples have Hamming distance 0; opposite halves are far apart", () => {
    const a = Array.from({ length: 64 }, (_, i) => (i < 32 ? 10 : 200));
    const b = Array.from({ length: 64 }, (_, i) => (i < 32 ? 200 : 10));
    expect(hammingHex(perceptualHash(a), perceptualHash(a))).toBe(0);
    expect(hammingHex(perceptualHash(a), perceptualHash(b))).toBeGreaterThan(20);
  });
});

describe("dctHash (v2 perceptual fingerprint)", () => {
  const N = DCT_SAMPLE_SIDE;
  // A structured 32×32 pattern (soft diagonal gradient + block).
  const pattern = Array.from({ length: N * N }, (_, i) => {
    const x = i % N, y = Math.floor(i / N);
    return Math.round(((x + y) / (2 * N)) * 200) + (x > 16 && y > 16 ? 40 : 0);
  });

  it("hashes a 32×32 sample to 16 hex chars, deterministically", () => {
    const h = dctHash(pattern);
    expect(h).toHaveLength(16);
    expect(dctHash(pattern)).toBe(h);
  });

  it("rejects malformed samples", () => {
    expect(dctHash([1, 2, 3])).toBe("");
    expect(dctHash(Array(N * N).fill(NaN))).toBe("");
  });

  it("is INVARIANT to uniform brightness shift (only DC moves)", () => {
    const brighter = pattern.map((v) => v + 30);
    expect(dctHash(brighter)).toBe(dctHash(pattern));
  });

  it("is INVARIANT to contrast scaling (median comparisons preserved)", () => {
    const scaled = pattern.map((v) => v * 1.5);
    expect(dctHash(scaled)).toBe(dctHash(pattern));
  });

  it("is robust to mild noise but separates a different scene", () => {
    // Deterministic mild noise (±4)
    const noisy = pattern.map((v, i) => v + (((i * 2654435761) >>> 28) % 9) - 4);
    expect(hammingHex(dctHash(noisy), dctHash(pattern))).toBeLessThanOrEqual(8);
    const other = Array.from({ length: N * N }, (_, i) => ((i % N) < 16 ? 220 : 15));
    expect(hammingHex(dctHash(other), dctHash(pattern))).toBeGreaterThan(12);
  });

  it("fingerprintOf dispatches by sample size (v2 32×32, v1 8×8, else empty)", () => {
    expect(fingerprintOf(pattern)).toBe(dctHash(pattern));
    const g8 = Array.from({ length: 64 }, (_, i) => i * 4);
    expect(fingerprintOf(g8)).toBe(perceptualHash(g8));
    expect(fingerprintOf([1, 2])).toBe("");
  });
});

describe("temporalConsistency (swap-flicker signature)", () => {
  const N = DCT_SAMPLE_SIDE;
  // Broadband "scenes": 8px light/dark blocks seeded per scene (rich low-freq
  // spectrum, like real frames — a pure sinusoid would be all quantization noise).
  const blocks = (seed: number) =>
    Array.from({ length: N * N }, (_, i) => {
      const bx = (i % N) >> 3, by = Math.floor(i / N) >> 3;
      const h = Math.imul(bx * 374761393 + by * 668265263 + seed * 974634749, 2654435761);
      return (h >>> 16) % 2 ? 205 : 45;
    });
  // Same scene, k frames later: brightness drift + small deterministic sensor noise.
  const drift = (base: number[], k: number) =>
    base.map((v, i) => v + k * 3 + ((((i * 2654435761 + k * 97) >>> 28) % 7) - 3));

  it("stable continuous shot → not unstable", () => {
    const base = blocks(1);
    const hashes = [0, 1, 2, 3, 4].map((k) => dctHash(drift(base, k)));
    const t = temporalConsistency(hashes)!;
    expect(t.unstable).toBe(false);
    expect(t.median).toBeLessThanOrEqual(12);
  });

  it("isolated jump inside a stable shot → unstable, with the innocent alternative", () => {
    // 7-frame continuous shot with ONE alien frame in the middle (swap flicker).
    const base = blocks(1);
    const hashes = [
      drift(base, 0), drift(base, 1), drift(base, 2),
      drift(blocks(9), 0), // the flicker
      drift(base, 3), drift(base, 4), drift(base, 5),
    ].map(dctHash);
    const t = temporalConsistency(hashes)!;
    expect(t.unstable).toBe(true);
    expect(t.spikes).toBeGreaterThanOrEqual(1);
    expect(t.note).toMatch(/scene cut/i);
  });

  it("an edited multi-scene video is NOT flagged (no stable baseline)", () => {
    const hashes = [1, 2, 3, 4, 5].map((s) => dctHash(blocks(s)));
    const t = temporalConsistency(hashes)!;
    expect(t.unstable).toBe(false);
    expect(t.note).toMatch(/edited|multi-scene/i);
  });

  it("too few frames → null (never an aggregate from 2 frames)", () => {
    expect(temporalConsistency([dctHash(blocks(1)), dctHash(blocks(2))])).toBeNull();
    expect(TEMPORAL_MIN_FRAMES).toBeGreaterThanOrEqual(3);
  });
});

describe("clusterPersonas (same synthetic face across clips)", () => {
  it("groups near-identical fingerprints and separates a distinct one", () => {
    const face = Array.from({ length: 64 }, (_, i) => (i % 3 === 0 ? 220 : 20));
    const faceNoisy = face.map((v, i) => (i === 0 ? 255 : v)); // tiny change
    const other = Array.from({ length: 64 }, (_, i) => (i % 2 === 0 ? 220 : 20));
    const clusters = clusterPersonas([
      { id: "clipA", fingerprint: perceptualHash(face) },
      { id: "clipB", fingerprint: perceptualHash(faceNoisy) },
      { id: "clipC", fingerprint: perceptualHash(other) },
    ]);
    const big = clusters.find((c) => c.members.length >= 2)!;
    expect(big.members.sort()).toEqual(["clipA", "clipB"]);
    expect(clusters.some((c) => c.members.length === 1 && c.members[0] === "clipC")).toBe(true);
  });
  it("is order-independent", () => {
    const f1 = perceptualHash(Array.from({ length: 64 }, (_, i) => i * 3));
    const f2 = perceptualHash(Array.from({ length: 64 }, (_, i) => 255 - i * 3));
    const a = clusterPersonas([{ id: "x", fingerprint: f1 }, { id: "y", fingerprint: f2 }]);
    const b = clusterPersonas([{ id: "y", fingerprint: f2 }, { id: "x", fingerprint: f1 }]);
    expect(a.length).toBe(b.length);
  });
});

describe("aggregateFrameScores", () => {
  it("returns Insufficient below the frame floor (Unknown, not a 1-frame verdict)", () => {
    const r = aggregateFrameScores([{ aiGenerated: 90 }, { aiGenerated: 88 }]);
    expect(r.insufficient).toBe(true);
    expect(r.confidence).toBe("Unknown");
    expect(r.frames).toBeLessThan(MIN_FRAMES);
  });
  it("high, agreeing scores across many frames → High confidence", () => {
    const frames = Array.from({ length: 8 }, () => ({ aiGenerated: 90, deepfake: 70 }));
    const r = aggregateFrameScores(frames);
    expect(r.insufficient).toBe(false);
    expect(r.aiGeneratedLikelihood).toBe(90);
    expect(r.deepfakeLikelihood).toBe(70);
    expect(r.confidence).toBe("High");
  });
  it("wide disagreement lowers confidence", () => {
    const frames = [{ aiGenerated: 10 }, { aiGenerated: 95 }, { aiGenerated: 40 }, { aiGenerated: 80 }];
    expect(aggregateFrameScores(frames).confidence).toBe("Low");
  });
});

describe("buildAssessment", () => {
  it("always carries an innocent alternative and the persona fingerprint", () => {
    const frames = Array.from({ length: 6 }, () => ({ aiGenerated: 85 }));
    const a = buildAssessment(frames, { personaFingerprint: "a1b2c3d4e5f60718", publicFigure: "appears to depict a public figure" });
    expect(a.alternative).toMatch(/verify|not proof/i);
    expect(a.personaFingerprint).toBe("a1b2c3d4e5f60718");
    expect(a.insufficient).toBe(false);
  });
});
