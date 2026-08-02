import { describe, it, expect } from "vitest";
import {
  perceptualHash,
  hammingHex,
  clusterPersonas,
  aggregateFrameScores,
  buildAssessment,
  MIN_FRAMES,
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
