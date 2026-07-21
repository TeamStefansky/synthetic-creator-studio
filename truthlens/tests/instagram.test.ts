// Instagram Business Discovery adapter (official Meta Graph, public-data-only).
// Network stubbed via global fetch. Ethics/honesty gates: no creds → "source not
// connected" with NO network call (never faked); a personal/private/not-found
// account → not connected with an honest reason; account creation date is never
// fabricated (the API doesn't expose it → createdAt stays undefined); snapshots
// carry no person/actor/operator field; the access token never appears in the
// public `fields` string.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  discoveryFields, parseIgError, mapDiscovery, normalizeIgUsername,
  instagramConfigured, fetchIgDiscovery,
} from "../lib/social/instagram";
import { parseProfileInput, fetchProfile } from "../lib/social/profile";
import { fetchAuthorPosts } from "../lib/social/timeline";

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
const jsonRes = (body: any, ok = true, status = 200) => ({
  ok, status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer,
});
const bytesRes = (bytes: Uint8Array) => ({
  ok: true, status: 200, arrayBuffer: async () => bytes.buffer,
  json: async () => ({}), text: async () => "",
});

// Unique usernames per run so the on-disk day-cache never leaks between runs.
const RUN = Math.random().toString(36).slice(2, 8);

// A representative Business Discovery payload.
function bdPayload(username: string) {
  return {
    business_discovery: {
      id: "17841400000000000",
      username,
      name: "Pulse Patriot",
      biography: "News and commentary",
      website: "https://example.us",
      profile_picture_url: "https://cdn.instagram.example/pp.jpg",
      followers_count: 48210,
      follows_count: 33,
      media_count: 512,
      media: {
        data: [
          { id: "m1", caption: "hello", like_count: 120, comments_count: 8, timestamp: "2024-06-01T10:00:00+0000", permalink: "https://www.instagram.com/p/AAA/", media_type: "IMAGE" },
          { id: "m2", caption: "world", like_count: 90, comments_count: 3, timestamp: "2024-06-02T10:00:00+0000", permalink: "https://www.instagram.com/p/BBB/", media_type: "VIDEO" },
        ],
      },
    },
    id: "17800000000000000",
  };
}

const SAVED = { tok: process.env.META_GRAPH_TOKEN, uid: process.env.IG_USER_ID };
beforeEach(() => vi.restoreAllMocks());
afterEach(() => {
  globalThis.fetch = realFetch;
  if (SAVED.tok === undefined) delete process.env.META_GRAPH_TOKEN; else process.env.META_GRAPH_TOKEN = SAVED.tok;
  if (SAVED.uid === undefined) delete process.env.IG_USER_ID; else process.env.IG_USER_ID = SAVED.uid;
});

describe("pure helpers", () => {
  it("discoveryFields builds a business_discovery query and never leaks a token", () => {
    const f = discoveryFields("someacct");
    expect(f).toContain("business_discovery.username(someacct)");
    expect(f).toContain("media.limit(25)");
    expect(f).toContain("like_count");
    expect(f).toContain("comments_count");
    expect(f).not.toMatch(/access_token/i);
  });

  it("normalizeIgUsername strips @ and lowercases", () => {
    expect(normalizeIgUsername("@Pulse_Patriot")).toBe("pulse_patriot");
    expect(normalizeIgUsername("  Foo.Bar ")).toBe("foo.bar");
  });

  it("parseIgError maps common Graph errors to honest reasons", () => {
    expect(parseIgError({ code: 190, message: "bad token" })).toMatch(/token is invalid or expired/i);
    expect(parseIgError({ code: 100, message: "Cannot find" })).toMatch(/not found.*personal\/private|personal\/private/i);
    expect(parseIgError({ code: 4, message: "rate limit" })).toMatch(/rate limit/i);
    expect(parseIgError({ code: 10, message: "no permission" })).toMatch(/permission/i);
    expect(parseIgError(undefined)).toMatch(/rejected/i);
  });

  it("mapDiscovery maps raw → typed; missing media → []", () => {
    const d = mapDiscovery(bdPayload("acct").business_discovery, "2024-06-03T00:00:00Z");
    expect(d.connected).toBe(true);
    expect(d.followersCount).toBe(48210);
    expect(d.followsCount).toBe(33);
    expect(d.mediaCount).toBe(512);
    expect(d.media?.length).toBe(2);
    expect(d.media?.[0]).toMatchObject({ id: "m1", likeCount: 120, commentsCount: 8 });
    // Creation date is never invented.
    expect(d).not.toHaveProperty("createdAt");
    const empty = mapDiscovery({ username: "x" }, "2024-06-03T00:00:00Z");
    expect(empty.media).toEqual([]);
  });
});

describe("parseProfileInput - Instagram", () => {
  it("parses instagram.com profile URLs (handle lowercased)", () => {
    expect(parseProfileInput("https://www.instagram.com/PulsePatriot.us/")).toEqual({ platform: "instagram", handle: "pulsepatriot.us" });
    expect(parseProfileInput("instagram.com/some_acct")).toEqual({ platform: "instagram", handle: "some_acct" });
  });
  it("rejects post / reel / story links and reserved paths", () => {
    expect(parseProfileInput("https://www.instagram.com/p/Cabc123/")).toBeNull();
    expect(parseProfileInput("https://instagram.com/reel/XYZ/")).toBeNull();
    expect(parseProfileInput("https://instagram.com/stories/foo/123/")).toBeNull();
    expect(parseProfileInput("https://instagram.com/explore/tags/x/")).toBeNull();
  });
});

describe("fetchIgDiscovery - honesty gates", () => {
  it("without META_GRAPH_TOKEN/IG_USER_ID → not connected, and NO network call", async () => {
    delete process.env.META_GRAPH_TOKEN;
    delete process.env.IG_USER_ID;
    expect(instagramConfigured()).toBe(false);
    stubFetch(() => jsonRes({}));
    const d = await fetchIgDiscovery(`nokey_${RUN}`);
    expect(d.connected).toBe(false);
    expect(d.reason).toMatch(/META_GRAPH_TOKEN.*IG_USER_ID|IG_USER_ID/);
    expect(fetchCalls.length).toBe(0); // nothing to fake, so nothing is attempted
  });

  it("a Graph error body → not connected with an honest reason (never faked data)", async () => {
    process.env.META_GRAPH_TOKEN = "TESTTOKEN";
    process.env.IG_USER_ID = "17800000000000000";
    stubFetch(() => jsonRes({ error: { code: 100, message: "Cannot find the account" } }, false, 400));
    const d = await fetchIgDiscovery(`missing_${RUN}`);
    expect(d.connected).toBe(false);
    expect(d.reason).toMatch(/personal\/private|not found/i);
    expect(d.media).toBeUndefined();
  });

  it("success → maps profile + media; the request URL carries an encoded token, the fields string does not", async () => {
    process.env.META_GRAPH_TOKEN = "SECRET-TOKEN-123";
    process.env.IG_USER_ID = "17800000000000000";
    const uname = `pulse_${RUN}`;
    stubFetch(() => jsonRes(bdPayload(uname)));
    const d = await fetchIgDiscovery(uname);
    expect(d.connected).toBe(true);
    expect(d.username).toBe(uname);
    expect(d.followersCount).toBe(48210);
    expect(d.media?.length).toBe(2);
    // Exactly one Graph call, hitting the official host with the token in the query.
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0]).toContain("graph.facebook.com");
    expect(fetchCalls[0]).toContain("access_token=SECRET-TOKEN-123");
  });
});

describe("fetchProfile / fetchAuthorPosts - Instagram", () => {
  it("fetchProfile maps a snapshot; createdAt stays Not collected; no person field", async () => {
    process.env.META_GRAPH_TOKEN = "TESTTOKEN";
    process.env.IG_USER_ID = "17800000000000000";
    const uname = `prof_${RUN}`;
    stubFetch((url) => (url.includes("graph.facebook.com") ? jsonRes(bdPayload(uname)) : bytesRes(new TextEncoder().encode("PP-BYTES"))));
    const s = await fetchProfile("instagram", uname);
    expect(s.connected).toBe(true);
    expect(s.platform).toBe("instagram");
    expect(s.followers).toBe(48210);
    expect(s.posts).toBe(512);
    expect(s.createdAt).toBeUndefined(); // API never exposes it → never invented
    expect(s.avatarHash).toMatch(/^[0-9a-f]{64}$/);
    const j = JSON.stringify(s).toLowerCase();
    for (const banned of ['"person"', '"actor"', '"operator"', '"realname"', '"real_name"']) {
      expect(j).not.toContain(banned);
    }
  });

  it("fetchAuthorPosts maps IG media to own-content mentions", async () => {
    process.env.META_GRAPH_TOKEN = "TESTTOKEN";
    process.env.IG_USER_ID = "17800000000000000";
    const uname = `tl_${RUN}`;
    stubFetch(() => jsonRes(bdPayload(uname)));
    const out = await fetchAuthorPosts("instagram", uname);
    expect(out.connected).toBe(true);
    expect(out.posts.length).toBe(2);
    expect(out.posts[0].source).toBe("instagram");
    expect(out.posts[0].engagement).toBe(128); // 120 likes + 8 comments
    expect(out.posts[0].url).toContain("instagram.com/p/");
  });
});
