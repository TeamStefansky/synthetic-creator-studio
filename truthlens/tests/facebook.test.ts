// Facebook Login (Meta OAuth) helpers. Gates: the authorize URL requests EXACTLY
// the four review scopes (never more); the app secret never appears in any
// browser-facing URL; the redirect URI honors the env override and falls back to
// the request origin; unconfigured → honestly not configured.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FB_SCOPES, fbConfigured, fbAuthorizeUrl, fbRedirectUri, sanitizeNextPath } from "@/lib/facebook";

const ENV_KEYS = ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET", "FACEBOOK_REDIRECT_URI"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("scope discipline", () => {
  it("requests exactly the four review permissions", () => {
    expect([...FB_SCOPES].sort()).toEqual(
      ["instagram_basic", "pages_read_engagement", "pages_show_list", "public_profile"].sort(),
    );
  });

  it("authorize URL carries only those scopes and no secret", () => {
    process.env.FACEBOOK_APP_ID = "1566011568209587";
    process.env.FACEBOOK_APP_SECRET = "test-secret-never-in-url";
    const url = new URL(fbAuthorizeUrl("https://example.com/api/auth/facebook/callback", "state123"));
    expect(url.hostname).toBe("www.facebook.com");
    expect(url.pathname).toMatch(/\/dialog\/oauth$/);
    expect(url.searchParams.get("scope")).toBe("public_profile,pages_show_list,pages_read_engagement,instagram_basic");
    expect(url.searchParams.get("client_id")).toBe("1566011568209587");
    expect(url.searchParams.get("state")).toBe("state123");
    expect(url.toString()).not.toContain("test-secret-never-in-url");
    expect(url.searchParams.has("client_secret")).toBe(false);
  });
});

describe("configuration honesty", () => {
  it("not configured without BOTH app id and secret", () => {
    expect(fbConfigured()).toBe(false);
    process.env.FACEBOOK_APP_ID = "123";
    expect(fbConfigured()).toBe(false);
    process.env.FACEBOOK_APP_SECRET = "abc";
    expect(fbConfigured()).toBe(true);
  });
});

describe("open-redirect guard (post-login next path)", () => {
  it("accepts only plain same-origin paths", () => {
    expect(sanitizeNextPath("/tools/meta")).toBe("/tools/meta");
    expect(sanitizeNextPath("/casebook?x=1")).toBe("/casebook?x=1");
  });
  it("rejects protocol-relative, absolute, backslash, and junk values", () => {
    for (const bad of ["//evil.com", "//evil.com/tools/meta", "https://evil.com", "/\\evil.com", "/tools\\..\\x", "javascript:alert(1)", "", null, undefined, 42]) {
      expect(sanitizeNextPath(bad as any)).toBe("/tools/meta");
    }
  });
});

describe("redirect URI", () => {
  it("derives from the request origin when the env var is unset", () => {
    expect(fbRedirectUri("http://localhost:3000")).toBe("http://localhost:3000/api/auth/facebook/callback");
    expect(fbRedirectUri("https://synthetic-creator-studio.vercel.app/")).toBe(
      "https://synthetic-creator-studio.vercel.app/api/auth/facebook/callback",
    );
  });
  it("FACEBOOK_REDIRECT_URI wins when set", () => {
    process.env.FACEBOOK_REDIRECT_URI = "https://custom.example/api/auth/facebook/callback";
    expect(fbRedirectUri("http://localhost:3000")).toBe("https://custom.example/api/auth/facebook/callback");
  });
});
