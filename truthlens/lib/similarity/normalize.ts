// Unicode-correct text normalization — the ONE place normalization happens.
// NFKC → lowercase → strip URLs → keep letters/numbers (any script) → collapse
// whitespace. Hebrew/Arabic/Cyrillic/CJK produce non-empty, stable keys (fixing
// the [a-z0-9]-only bug that silently dropped every non-Latin mention).

export function normalizeText(t: string): string {
  return (t || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // keep letters + numbers in ANY script
    .replace(/\s+/gu, " ")
    .trim();
}
