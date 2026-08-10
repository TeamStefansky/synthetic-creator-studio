// Multilingual / IDN domain-character classification. Gates: the punycode
// decoder matches known IANA vectors; native-script hate terms flag as extremist
// (Hebrew/Arabic/Cyrillic/Greek/German); an IDN (xn--) hate domain is decoded
// then flagged; ordinary non-Latin names stay neutral (no false positives on
// "national"/"national" cognates); the name≠content caveat always rides along.

import { describe, it, expect } from "vitest";
import { decodePunycodeLabel, idnToUnicode } from "@/lib/host-conduct/punycode";
import { classifyDomainCharacter, NAME_NOT_CONTENT } from "@/lib/host-conduct/classify";

describe("punycode decoder", () => {
  it("decodes known IANA/RFC vectors", () => {
    expect(decodePunycodeLabel("bcher-kva")).toBe("bücher");
    expect(decodePunycodeLabel("mnchen-3ya")).toBe("münchen");
    expect(decodePunycodeLabel("mgbh0fb")).toBe("مثال"); // Arabic "example"
  });
  it("idnToUnicode decodes xn-- labels and passes others through", () => {
    expect(idnToUnicode("xn--mnchen-3ya.de")).toBe("münchen.de");
    expect(idnToUnicode("plain.com")).toBe("plain.com");
    expect(idnToUnicode("xn--mnchen-3ya.plain.com")).toBe("münchen.plain.com");
  });
  it("never throws on malformed input - keeps the original label", () => {
    expect(idnToUnicode("xn--!!!bad.com")).toBe("xn--!!!bad.com");
  });
});

describe("classifyDomainCharacter - all scripts", () => {
  const extremist = [
    "hitler.nu", "drittereich.de", "sieg-heil.net", // Latin/German
    "היטלר.co.il", "נאצי.com",                        // Hebrew
    "هتلر.com", "النازية.net",                        // Arabic
    "гитлер.рф", "нацизм.su",                         // Cyrillic
    "χίτλερ.gr",                                      // Greek
    "combat18.org", "site1488.net",                  // numeric hate codes
  ];
  for (const d of extremist) {
    it(`flags extremist: ${d}`, () => {
      const r = classifyDomainCharacter(d);
      expect(r.character).toBe("extremist");
      expect(r.caveat).toBe(NAME_NOT_CONTENT);
    });
  }

  it("decodes REAL IDN (punycode) hate domains end-to-end, then flags them", () => {
    // Verified vectors (Node punycode.encode): xn--4dbstz=נאצי, xn--c1aeim0aj=гитлер,
    // xn--pgbo0dk=هتلر, xn--80aocrb9c=нацизм. The classifier decodes xn-- first.
    expect(idnToUnicode("xn--4dbstz.com")).toBe("נאצי.com");
    expect(classifyDomainCharacter("xn--4dbstz.com").character).toBe("extremist"); // נאצי
    expect(classifyDomainCharacter("xn--c1aeim0aj.rf").character).toBe("extremist"); // гитлер
    expect(classifyDomainCharacter("xn--pgbo0dk.net").character).toBe("extremist"); // هتلر
    expect(classifyDomainCharacter("xn--80aocrb9c.su").character).toBe("extremist"); // нацизм
  });

  it("no false positives on ordinary non-Latin names", () => {
    expect(classifyDomainCharacter("מאפיה-שכונתית.co.il").character).toBe("neutral"); // neighborhood bakery
    expect(classifyDomainCharacter("национальный-музей.рф").character).toBe("neutral"); // "national museum" ≠ nazi
    expect(classifyDomainCharacter("nazionale-calcio.it").character).toBe("neutral"); // Italian "national football"? contains "nazi"...
  });

  it("classifies activism/privacy across scripts", () => {
    expect(classifyDomainCharacter("مقاومة.net").character).toBe("activism"); // Arabic "resistance"
    expect(classifyDomainCharacter("הצפנה.co.il").character).toBe("privacy"); // Hebrew "encryption"
    expect(classifyDomainCharacter("анархия.su").character).toBe("activism"); // Cyrillic "anarchy"
  });
});
