// [3] Social Analyze - profile-seeded pipeline. Network fully stubbed.
// Ethics gates: the band vocabulary is EXACTLY Unknown/Low/Moderate/"Strong
// coordination - actor UNDETERMINED"; nothing collected → Unknown (never a
// fabricated grade); the verbatim attribution ships on every report; no
// person/actor/operator field anywhere.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractSeeds, topTerms } from "../lib/social-analyze/seed";
import { runSocialAnalyze } from "../lib/social-analyze/orchestrate";
import { fetchAuthorPosts } from "../lib/social/timeline";
import { detectCheckType } from "../lib/check/detect";
import type { Mention } from "../lib/narrative/types";

const T0 = Date.UTC(2024, 3, 1, 12, 0, 0);
const MIN = 60_000;
const RUN = Math.random().toString(36).slice(2, 8);

function mk(account: string, text: string, tMs: number): Mention {
  return { source: "bluesky", id: `${account}-${tMs}`, text, account, accountId: account,
    timestamp: new Date(tMs).toISOString() };
}

const realFetch = globalThis.fetch;
function stubFetch(handler: (url: string) => any) {
  globalThis.fetch = vi.fn(async (input: any) => handler(String(input))) as any;
}
const jsonRes = (body: any) => ({
  ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body),
  arrayBuffer: async () => new ArrayBuffer(0),
});
const failRes = { ok: false, status: 500, json: async () => ({}), text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };

beforeEach(() => vi.restoreAllMocks());
afterEach(() => { globalThis.fetch = realFetch; });

describe("seed extraction (stage 2)", () => {
  const PUSH = "השקיעו עכשיו במטבע החדש לפני שהבנקים יעצרו את ההזדמנות הזאת לתמיד";
  it("a repeated pushed message becomes the top seed with a Unicode-safe query", () => {
    const own = [
      mk("s", PUSH, T0), mk("s", PUSH + " שתפו", T0 + MIN), mk("s", PUSH, T0 + 2 * MIN),
      mk("s", "סתם פוסט רגיל על מזג האוויר היום בעיר", T0 + 3 * MIN),
    ];
    const seeds = extractSeeds(own);
    expect(seeds.length).toBeGreaterThanOrEqual(1);
    expect(seeds[0].posts).toBe(3);
    expect(seeds[0].query.split(" ").length).toBeGreaterThanOrEqual(2);
    expect(extractSeeds(own)).toEqual(seeds); // deterministic
  });
  it("emoji/short filler yields no seeds; empty input yields none", () => {
    expect(extractSeeds([mk("s", "🔥🔥", T0), mk("s", "nice", T0 + MIN)])).toEqual([]);
    expect(extractSeeds([])).toEqual([]);
  });
  it("topTerms is Unicode-aware", () => {
    expect(topTerms("הבנקים יעצרו את ההזדמנות הזאת").length).toBeGreaterThan(0);
    expect(topTerms("the quick brown fox jumps")).toContain("quick");
  });
});

describe("fetchAuthorPosts (stage 1 timeline)", () => {
  it("maps the Bluesky author feed, skipping reposts", async () => {
    const handle = `tl-${RUN}.bsky.social`;
    stubFetch((url) => {
      if (url.includes("getAuthorFeed")) {
        return jsonRes({ feed: [
          { post: { uri: "at://did/app.bsky.feed.post/1", author: { handle, did: "did:plc:t" }, record: { text: "my own words here", createdAt: new Date(T0).toISOString() }, likeCount: 2 } },
          { reason: { $type: "repost" }, post: { uri: "at://x/2", author: { handle: "other" }, record: { text: "someone else's post" } } },
        ] });
      }
      return failRes;
    });
    const out = await fetchAuthorPosts("bluesky", handle);
    expect(out.connected).toBe(true);
    expect(out.posts.length).toBe(1); // repost skipped
    expect(out.posts[0].text).toBe("my own words here");
  });
  it("X without a token → not connected, zero calls", async () => {
    const saved = process.env.X_BEARER_TOKEN;
    delete process.env.X_BEARER_TOKEN;
    let calls = 0;
    stubFetch(() => { calls++; return failRes; });
    const out = await fetchAuthorPosts("x", `nokey_${RUN}`);
    expect(out.connected).toBe(false);
    expect(out.reason).toMatch(/X_BEARER_TOKEN/);
    expect(calls).toBe(0);
    if (saved) process.env.X_BEARER_TOKEN = saved;
  });
});

describe("runSocialAnalyze (full pipeline, stubbed network)", () => {
  const PUSH = "the secret ballot machines were rigged by the operators overnight across the country";

  function pipelineStub(handle: string, opts: { amplifiers?: boolean } = {}) {
    return (url: string) => {
      if (url.includes("getProfile")) {
        return jsonRes({ did: "did:plc:seed", handle, displayName: "Seed", avatar: undefined,
          createdAt: "2024-03-01T00:00:00Z", followersCount: 80, followsCount: 2100, postsCount: 40 });
      }
      if (url.includes("getAuthorFeed")) {
        return jsonRes({ feed: [PUSH, PUSH + " share now", PUSH].map((t, i) => ({
          post: { uri: `at://did:plc:seed/p/${i}`, author: { handle, did: "did:plc:seed" },
            record: { text: t, createdAt: new Date(T0 + i * MIN).toISOString(), langs: ["en"] }, likeCount: 3 },
        })) });
      }
      if (url.includes("searchPosts")) {
        if (!opts.amplifiers) return jsonRes({ posts: [] });
        return jsonRes({ posts: [1, 2, 3, 4].map((k) => ({
          uri: `at://did:plc:amp${k}/p/1`, cid: `c${k}`,
          author: { handle: `amp${k}.bsky.social`, did: `did:plc:amp${k}` },
          record: { text: PUSH, createdAt: new Date(T0 + k * MIN).toISOString(), langs: ["en"] },
          likeCount: 1,
        })) });
      }
      return failRes; // every other source: unreachable → failure-isolated
    };
  }

  it("coordinated amplification → the exact frozen ceiling band, with attribution + no actor field", async () => {
    const handle = `seed-a-${RUN}.bsky.social`;
    stubFetch(pipelineStub(handle, { amplifiers: true }));
    const r = await runSocialAnalyze(`https://bsky.app/profile/${handle}`);
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.band).toBe("Strong coordination - actor UNDETERMINED");
    expect(r.seeds.length).toBeGreaterThanOrEqual(1);
    expect(r.expansion!.accounts).toBeGreaterThanOrEqual(4);
    expect(r.attribution).toMatch(/UNDETERMINED/);
    expect(r.authenticity).toBeDefined();
    expect(r.authenticity!.confidence).toBeGreaterThan(0); // profile collected → account signals ran
    const j = JSON.stringify(r).toLowerCase();
    for (const banned of ['"actor"', '"person"', '"operator"', '"origin"']) expect(j).not.toContain(banned);
  });

  it("no amplification found + sources mostly down → Unknown or Low, never fabricated Strong", async () => {
    const handle = `seed-b-${RUN}.bsky.social`;
    stubFetch(pipelineStub(handle, { amplifiers: false }));
    const r = await runSocialAnalyze(`https://bsky.app/profile/${handle}`);
    if ("error" in r) throw new Error(r.error);
    expect(["Unknown", "Low"]).toContain(r.band);
    expect(r.band).not.toMatch(/Strong/);
  });

  it("garbage input → a clear error, not a guessed platform", async () => {
    const r = await runSocialAnalyze("not a profile at all");
    expect("error" in r).toBe(true);
  });
});

describe("check-type detection for social", () => {
  it("profile links / @handles → social; status links stay post; bare domains stay site", () => {
    expect(detectCheckType("https://bsky.app/profile/alice.bsky.social").type).toBe("social");
    expect(detectCheckType("https://x.com/SomeAccount").type).toBe("social");
    expect(detectCheckType("@newsbot99").type).toBe("social");
    expect(detectCheckType("https://x.com/someone/status/123").type).toBe("post");
    expect(detectCheckType("https://bsky.app/profile/alice.bsky.social/post/abc").type).toBe("post");
    expect(detectCheckType("example.co.il").type).toBe("site");
    expect(detectCheckType("https://example-news.com/article").type).toBe("site");
  });
});
