import { describe, it, expect } from "vitest";
import { isBlockedIp, isBlockedHostname, assertSafeUrl, parseFeed, sanitizeText } from "../lib/feeds/fetch";
import { normalizeFeedUrl, validateAndPreview } from "../lib/feeds/store";

describe("SSRF guard", () => {
  it("blocks private / loopback / link-local / metadata IPs", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.16.0.1", "192.168.1.1", "::1", "0.0.0.0", "100.64.0.1", "fd00::1", "fe80::1"]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });
  it("allows normal public IPs", () => {
    for (const ip of ["1.1.1.1", "8.8.8.8", "203.0.113.10"]) expect(isBlockedIp(ip), ip).toBe(false);
  });
  it("blocks internal hostnames by name", () => {
    for (const h of ["localhost", "foo.local", "svc.internal", "metadata.google.internal"]) {
      expect(isBlockedHostname(h), h).toBe(true);
    }
    expect(isBlockedHostname("example.com")).toBe(false);
  });
  it("assertSafeUrl rejects non-http(s), literal private IPs, and internal hosts (no DNS needed)", async () => {
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow();
    await expect(assertSafeUrl("gopher://x")).rejects.toThrow();
    await expect(assertSafeUrl("http://127.0.0.1/feed.xml")).rejects.toThrow();
    await expect(assertSafeUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow();
    await expect(assertSafeUrl("http://localhost:8080/feed")).rejects.toThrow();
    await expect(assertSafeUrl("not a url")).rejects.toThrow();
  });
});

describe("sanitizeText", () => {
  it("strips HTML/scripts/CDATA and decodes entities", () => {
    expect(sanitizeText("<![CDATA[<b>Hi</b> &amp; <script>evil()</script> bye]]>")).toBe("Hi & bye");
    expect(sanitizeText("<a href='x' onclick='y'>Link</a>")).toBe("Link");
  });
});

describe("parseFeed", () => {
  it("parses RSS 2.0 with sanitized titles", () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>My Feed</title><link>https://ex.com</link>
      <item><title><![CDATA[First <b>post</b>]]></title><link>https://ex.com/1</link><guid>g1</guid><description>Hello &amp; world</description><pubDate>Wed, 01 Jul 2026 08:00:00 GMT</pubDate></item>
      <item><title>Second</title><link>https://ex.com/2</link></item></channel></rss>`;
    const f = parseFeed(xml);
    expect(f.kind).toBe("rss");
    expect(f.title).toBe("My Feed");
    expect(f.items).toHaveLength(2);
    expect(f.items[0].title).toBe("First post");
    expect(f.items[0].summary).toBe("Hello & world");
    expect(f.items[0].timestamp).toMatch(/^2026-07-01T/);
  });
  it("parses Atom", () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Feed</title><link href="https://a.com"/>
      <entry><title>Entry one</title><link href="https://a.com/1"/><id>u1</id><summary>Sum one</summary><updated>2026-07-02T10:00:00Z</updated></entry></feed>`;
    const f = parseFeed(xml);
    expect(f.kind).toBe("atom");
    expect(f.title).toBe("Atom Feed");
    expect(f.items[0].title).toBe("Entry one");
    expect(f.items[0].link).toBe("https://a.com/1");
  });
  it("rejects a non-feed document (so it is never saved)", () => {
    expect(() => parseFeed("<html><body>not a feed</body></html>")).toThrow();
    expect(() => parseFeed("")).toThrow();
  });
});

describe("normalizeFeedUrl", () => {
  it("lowercases host, strips trailing slash + hash for dedup", () => {
    expect(normalizeFeedUrl("HTTPS://Ex.COM/Feed/#top")).toBe("https://ex.com/Feed");
    expect(normalizeFeedUrl("https://ex.com/feed")).toBe("https://ex.com/feed");
  });
});

describe("validateAndPreview refuses unsafe URLs before any fetch", () => {
  it("throws on an internal URL without saving", async () => {
    await expect(validateAndPreview("http://127.0.0.1/feed.xml")).rejects.toThrow();
  });
});
