import { describe, it, expect } from "vitest";
import { detectCheckType } from "../lib/check/detect";

describe("detectCheckType", () => {
  it("classifies a website URL as a Site Report", () => {
    expect(detectCheckType("https://example-news.com/article").type).toBe("site");
    expect(detectCheckType("example.co.il").type).toBe("site");
  });

  it("classifies a social post link as a Post Check", () => {
    expect(detectCheckType("https://x.com/someone/status/123").type).toBe("post");
    expect(detectCheckType("https://www.reddit.com/r/x/comments/abc").type).toBe("post");
  });

  it("classifies raw email headers as an Email Tracer", () => {
    const headers = "Received: from mail.example.com\nReturn-Path: <a@b.com>\nFrom: A <a@b.com>\nSubject: hi";
    expect(detectCheckType(headers).type).toBe("email");
  });

  it("classifies server logs as a Log Analyzer", () => {
    const logs = [
      '10.0.0.1 - - [10/Oct/2024] "GET /a HTTP/1.1" 200',
      '10.0.0.2 - - [10/Oct/2024] "POST /b HTTP/1.1" 404',
      '10.0.0.3 - - [10/Oct/2024] "GET /c HTTP/1.1" 200',
    ].join("\n");
    expect(detectCheckType(logs).type).toBe("logs");
  });

  it("falls back to Post Check for free-text claims", () => {
    expect(detectCheckType("The mayor secretly funded the protest, they say").type).toBe("post");
  });

  it("always returns a level and a reason", () => {
    const d = detectCheckType("hello");
    expect(["Low", "Medium", "High"]).toContain(d.confidence);
    expect(d.reason.length).toBeGreaterThan(0);
  });
});
