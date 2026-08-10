// Programmatic API auth helpers (pure). Gates: keys parse/dedupe with a min
// length; key match is exact and length-safe; the key is read from either header
// form; the rate-limit verdict flips exactly at the limit.

import { describe, it, expect } from "vitest";
import {
  parseApiKeys, keyMatches, extractKey, rateLimitVerdict, bucketHash,
} from "@/lib/api/auth";

describe("parseApiKeys", () => {
  it("trims, dedupes, and drops too-short keys", () => {
    expect(parseApiKeys("abcdefgh, abcdefgh , short, ijklmnop"))
      .toEqual(["abcdefgh", "ijklmnop"]);
    expect(parseApiKeys(undefined)).toEqual([]);
    expect(parseApiKeys("")).toEqual([]);
  });
});

describe("keyMatches", () => {
  const keys = ["alpha-key-123456", "bravo-key-7890ab"];
  it("accepts an exact key and rejects near-misses", () => {
    expect(keyMatches("alpha-key-123456", keys)).toBe(true);
    expect(keyMatches("alpha-key-123457", keys)).toBe(false);
    expect(keyMatches("alpha-key-12345", keys)).toBe(false); // shorter
    expect(keyMatches("", keys)).toBe(false);
    expect(keyMatches("alpha-key-123456", [])).toBe(false);
  });
});

describe("extractKey", () => {
  it("reads Authorization: Bearer and x-api-key", () => {
    expect(extractKey(new Headers({ authorization: "Bearer my-secret-key" }))).toBe("my-secret-key");
    expect(extractKey(new Headers({ "x-api-key": "another-key" }))).toBe("another-key");
    expect(extractKey(new Headers({}))).toBe("");
  });
  it("Bearer takes precedence and is case-insensitive on the scheme", () => {
    expect(extractKey(new Headers({ authorization: "bearer lower-scheme-key" }))).toBe("lower-scheme-key");
  });
});

describe("rateLimitVerdict", () => {
  it("limits strictly above the ceiling; reports remaining", () => {
    expect(rateLimitVerdict(1, 60)).toEqual({ limited: false, remaining: 59 });
    expect(rateLimitVerdict(60, 60)).toEqual({ limited: false, remaining: 0 });
    expect(rateLimitVerdict(61, 60)).toEqual({ limited: true, remaining: 0 });
  });
});

describe("bucketHash", () => {
  it("is deterministic and non-empty", () => {
    expect(bucketHash("some-key")).toBe(bucketHash("some-key"));
    expect(bucketHash("some-key")).not.toBe(bucketHash("other-key"));
    expect(bucketHash("some-key").length).toBeGreaterThan(0);
  });
});
