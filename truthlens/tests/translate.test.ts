import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { translateToEnglish, translateFeedItems, translationAvailable } from "../lib/translate";

// Honesty gate (CLAUDE.md rule 7): with no ANTHROPIC_API_KEY the translator must
// return the ORIGINAL text unchanged — never a fabricated/placeholder translation.
describe("translate — fail-open without a key", () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => { delete process.env.ANTHROPIC_API_KEY; });
  afterEach(() => { if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved; });

  it("reports unavailable without a key", () => {
    expect(translationAvailable()).toBe(false);
  });
  it("returns the original strings unchanged when there is no key", async () => {
    const input = ["Bonjour le monde", "مرحبا بالعالم", "Guerra en Ucrania"];
    expect(await translateToEnglish(input)).toEqual(input);
  });
  it("passes feed items through unchanged without a key", async () => {
    const items = [{ title: "Guerre en Ukraine", summary: "résumé", link: "https://x.com/1" }] as any;
    expect(await translateFeedItems(items)).toEqual(items);
  });
  it("handles empty input", async () => {
    expect(await translateToEnglish([])).toEqual([]);
  });
});
