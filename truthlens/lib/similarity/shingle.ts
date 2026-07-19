// Shingling for near-duplicate detection. Word-level (n=3) for space-segmented
// scripts; falls back to character shingles (n=4) for unsegmented scripts (CJK,
// Thai…) or very short text, so paraphrase/near-dup works across all languages.

import { normalizeText } from "./normalize";

export const WORD_SHINGLE_N = 3;
export const CHAR_SHINGLE_N = 4;

/** Shingle set for already-normalized text. */
export function shingle(normalized: string): string[] {
  const words = normalized.split(" ").filter(Boolean);
  if (words.length >= WORD_SHINGLE_N) {
    const out: string[] = [];
    for (let i = 0; i <= words.length - WORD_SHINGLE_N; i++) {
      out.push(words.slice(i, i + WORD_SHINGLE_N).join(" "));
    }
    return out;
  }
  // Fallback: character shingles over the space-stripped string (unsegmented
  // scripts, or text with fewer than n words).
  const chars = normalized.replace(/\s+/gu, "");
  if (chars.length < CHAR_SHINGLE_N) return chars ? [chars] : [];
  const out: string[] = [];
  for (let i = 0; i <= [...chars].length - CHAR_SHINGLE_N; i++) {
    out.push([...chars].slice(i, i + CHAR_SHINGLE_N).join(""));
  }
  return out;
}

/** Convenience: normalize then shingle. */
export function shingleText(text: string): string[] {
  return shingle(normalizeText(text));
}
