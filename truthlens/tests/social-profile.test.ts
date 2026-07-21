// [2] Account Authenticity - P1: ProfileSnapshot layer.
// Network is stubbed via global fetch. Ethics gates: X without a token renders
// "not connected" (never faked, and no network call is even attempted); snapshots
// carry no person/actor/operator field; avatar hash is deterministic exact-match.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseProfileInput, fetchProfile } from "../lib/social/profile";
import { avatarContentHash, sameAvatar } from "../lib/social/avatar";

const realFetch = globalThis.fetch;
let fetchCalls: string[] = [];

function stubFetch(handler: (url: string) => any) {
  fetchCalls = [];
  globalThis.fetch = vi.fn(async (input: any) => {
    const url = String(input);
    fetchCalls.push(url);
    return handler(url);
  }) as any;
}
const jsonRes = (body: any) => ({
  ok: true, status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
  arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer,
});
const bytesRes = (bytes: Uint8Array) => ({
  ok: true, status: 200, arrayBuffer: async () => bytes.buffer,
  json: async () => ({}), text: async () => "",
});

// Unique handles per run so the on-disk day-cache never leaks between runs.
const RUN = Math.random().toString(36).slice(2, 8);

beforeEach(() => vi.restoreAllMocks());
afterEach(() => { globalThis.fetch = realFetch; });

describe("parseProfileInput", () => {
  it("parses Bluesky profile URLs, DIDs, and domain-shaped handles", () => {
    expect(parseProfileInput("https://bsky.app/profile/alice.bsky.social")).toEqual({ platform: "bluesky", handle: "alice.bsky.social" });
    expect(parseProfileInput("did:plc:abc123")).toEqual({ platform: "bluesky", handle: "did:plc:abc123" });
    expect(parseProfileInput("@alice.bsky.social")).toEqual({ platform: "bluesky", handle: "alice.bsky.social" });
  });
  it("parses X profile URLs and bare @handles", () => {
    expect(parseProfileInput("https://x.com/SomeAccount")).toEqual({ platform: "x", handle: "SomeAccount" });
    expect(parseProfileInput("https://twitter.com/@Some_Acct")).toEqual({ platform: "x", handle: "Some_Acct" });
    expect(parseProfileInput("@newsbot99")).toEqual({ platform: "x", handle: "newsbot99" });
  });
  it("rejects post/status URLs, reserved paths, and garbage", () => {
    expect(parseProfileInput("https://x.com/i/status/123")).toBeNull();
    expect(parseProfileInput("https://example.com/whatever")).toBeNull();
    expect(parseProfileInput("just some words")).toBeNull();
    expect(parseProfileInput("")).toBeNull();
  });
});

describe("fetchProfile - Bluesky (keyless)", () => {
  it("maps the public AppView profile onto a ProfileSnapshot", async () => {
    const handle = `acct-${RUN}.bsky.social`;
    stubFetch((url) => {
      if (url.includes("getProfile")) {
        return jsonRes({
          did: "did:plc:xyz", handle, displayName: "Acct", description: "news reposts",
          avatar: "https://cdn.example/avatar.jpg", createdAt: "2024-01-01T00:00:00Z",
          followersCount: 10, followsCount: 500, postsCount: 1234,
        });
      }
      return bytesRes(new TextEncoder().encode("AVATAR-BYTES"));
    });
    const s = await fetchProfile("bluesky", handle);
    expect(s.connected).toBe(true);
    expect(s.accountId).toBe("did:plc:xyz");
    expect(s.followers).toBe(10);
    expect(s.follows).toBe(500);
    expect(s.createdAt).toBe("2024-01-01T00:00:00Z");
    expect(s.avatarHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ethics: snapshot JSON carries no person/actor/operator field", async () => {
    const handle = `eth-${RUN}.bsky.social`;
    stubFetch(() => jsonRes({ did: "did:plc:e", handle }));
    const s = await fetchProfile("bluesky", handle);
    const j = JSON.stringify(s).toLowerCase();
    for (const banned of ['"person"', '"actor"', '"operator"', '"realname"', '"real_name"']) {
      expect(j).not.toContain(banned);
    }
  });
});

describe("fetchProfile - X (key-gated, honest)", () => {
  it("without X_BEARER_TOKEN → connected:false with reason, and NO network call", async () => {
    const saved = process.env.X_BEARER_TOKEN;
    delete process.env.X_BEARER_TOKEN;
    stubFetch(() => jsonRes({}));
    const s = await fetchProfile("x", `nokey_${RUN}`);
    expect(s.connected).toBe(false);
    expect(s.reason).toMatch(/X_BEARER_TOKEN/);
    expect(fetchCalls.length).toBe(0); // never even tried - nothing to fake
    if (saved) process.env.X_BEARER_TOKEN = saved;
  });
});

describe("avatarContentHash", () => {
  it("is deterministic for identical bytes and differs for different bytes", async () => {
    const A = new TextEncoder().encode("SAME-AVATAR-FILE");
    const B = new TextEncoder().encode("DIFFERENT-AVATAR");
    stubFetch((url) => (url.includes("/a.") ? bytesRes(A) : bytesRes(B)));
    const h1 = await avatarContentHash(`https://cdn.example/${RUN}/a.png`);
    const h2 = await avatarContentHash(`https://cdn.example/${RUN}-again/a.png`);
    const h3 = await avatarContentHash(`https://cdn.example/${RUN}/b.png`);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(sameAvatar(h1!, h2!)).toBe(true);
    expect(sameAvatar(h1!, h3!)).toBe(false);
  });
  it("uncollectable avatar → null (Not collected), never a fake hash", async () => {
    stubFetch(() => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({}), text: async () => "" }));
    expect(await avatarContentHash(`https://cdn.example/${RUN}/missing.png`)).toBeNull();
    expect(sameAvatar(undefined, undefined)).toBe(false); // absent ≠ match
  });
});
