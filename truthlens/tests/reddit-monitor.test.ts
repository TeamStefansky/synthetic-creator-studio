import { describe, it, expect } from "vitest";
import { parseSubredditQuery, redditOauthConnected } from "@/lib/narrative/sources";

describe("Reddit monitoring — subreddit query parsing", () => {
  it("scopes r/<sub> with residual terms", () => {
    expect(parseSubredditQuery("r/geopolitics sanctions")).toEqual({ sub: "geopolitics", rest: "sanctions" });
  });
  it("treats subreddit:<sub> the same", () => {
    expect(parseSubredditQuery("subreddit:worldnews")).toEqual({ sub: "worldnews", rest: "" });
  });
  it("a bare community becomes a new-feed monitor (no residual terms)", () => {
    expect(parseSubredditQuery("r/WorldNews")).toEqual({ sub: "worldnews", rest: "" });
  });
  it("a plain keyword query has no subreddit scope", () => {
    expect(parseSubredditQuery("foreign influence")).toEqual({ sub: undefined, rest: "foreign influence" });
  });
});

describe("Reddit OAuth availability", () => {
  it("reports not-connected without credentials (keyless fallback, never faked)", () => {
    const prev = [process.env.REDDIT_CLIENT_ID, process.env.REDDIT_CLIENT_SECRET];
    delete process.env.REDDIT_CLIENT_ID; delete process.env.REDDIT_CLIENT_SECRET;
    expect(redditOauthConnected()).toBe(false);
    process.env.REDDIT_CLIENT_ID = "x"; process.env.REDDIT_CLIENT_SECRET = "y";
    expect(redditOauthConnected()).toBe(true);
    if (prev[0] === undefined) delete process.env.REDDIT_CLIENT_ID; else process.env.REDDIT_CLIENT_ID = prev[0];
    if (prev[1] === undefined) delete process.env.REDDIT_CLIENT_SECRET; else process.env.REDDIT_CLIENT_SECRET = prev[1];
  });
});
