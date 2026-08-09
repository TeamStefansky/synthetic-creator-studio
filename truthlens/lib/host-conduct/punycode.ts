// Minimal RFC 3492 punycode decoder — so internationalized domain names (IDN,
// the `xn--…` labels) are matched in their NATIVE script (Hebrew, Arabic,
// Cyrillic, Greek, CJK, …) rather than as opaque ASCII. Pure, dependency-free,
// deterministic. Decode-only (we never emit IDNs, only read them).

const BASE = 36, TMIN = 1, TMAX = 26, SKEW = 38, DAMP = 700, INITIAL_BIAS = 72, INITIAL_N = 128;

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  delta = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
  delta += Math.floor(delta / numPoints);
  let k = 0;
  while (delta > ((BASE - TMIN) * TMAX) >> 1) {
    delta = Math.floor(delta / (BASE - TMIN));
    k += BASE;
  }
  return Math.floor(k + ((BASE - TMIN + 1) * delta) / (delta + SKEW));
}

/** ASCII code point → digit (a-z → 0-25, 0-9 → 26-35); BASE if invalid. */
function basicToDigit(cp: number): number {
  if (cp >= 0x30 && cp <= 0x39) return cp - 22; // '0'-'9' → 26-35
  if (cp >= 0x41 && cp <= 0x5a) return cp - 65; // 'A'-'Z' → 0-25
  if (cp >= 0x61 && cp <= 0x7a) return cp - 97; // 'a'-'z' → 0-25
  return BASE;
}

/** Decode a single punycode label (WITHOUT the `xn--` prefix). Throws on malformed. */
export function decodePunycodeLabel(input: string): string {
  const output: number[] = [];
  let n = INITIAL_N, i = 0, bias = INITIAL_BIAS;
  const lastDelim = input.lastIndexOf("-");
  const basic = lastDelim < 0 ? 0 : lastDelim;
  for (let j = 0; j < basic; j++) {
    const c = input.charCodeAt(j);
    if (c >= 0x80) throw new Error("bad basic code point");
    output.push(c);
  }
  let index = basic > 0 ? basic + 1 : 0;
  while (index < input.length) {
    const oldi = i;
    let w = 1;
    for (let k = BASE; ; k += BASE) {
      if (index >= input.length) throw new Error("truncated");
      const digit = basicToDigit(input.charCodeAt(index++));
      if (digit >= BASE) throw new Error("bad digit");
      if (digit > Math.floor((0x7fffffff - i) / w)) throw new Error("overflow");
      i += digit * w;
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
      if (digit < t) break;
      w *= BASE - t;
    }
    const out = output.length + 1;
    bias = adapt(i - oldi, out, oldi === 0);
    n += Math.floor(i / out);
    i %= out;
    if (n > 0x10ffff) throw new Error("bad code point");
    output.splice(i++, 0, n);
  }
  return String.fromCodePoint(...output);
}

/**
 * Convert an ASCII/IDN domain to Unicode: every `xn--` label is decoded to its
 * native script, all others pass through. On any malformed label the ORIGINAL
 * label is kept (never throws — a classifier must not crash on junk input).
 */
export function idnToUnicode(domain: string): string {
  return (domain || "")
    .toLowerCase()
    .split(".")
    .map((label) => {
      if (!label.startsWith("xn--")) return label;
      try { return decodePunycodeLabel(label.slice(4)); } catch { return label; }
    })
    .join(".");
}
