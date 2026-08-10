// Parse the Connections paste box into a list of URLs.
//
// Separators are whitespace (newlines/spaces) or a comma/semicolon that is FOLLOWED
// by whitespace. A BARE comma is NOT a separator: URLs can legitimately contain
// commas (e.g. Ynet's https://www.ynet.co.il/home/0,7340,L-8,00.html), and splitting
// on every comma shredded such a URL into invalid fragments. No node deps - safe to
// import from the client component and unit-test.
export function parseFeedInput(input: string): string[] {
  return [...new Set(
    input
      .split(/\s+|[,;](?=\s)/)
      .map((s) => s.trim().replace(/[,;]+$/, ""))
      .filter(Boolean),
  )];
}

// A field is a URL or a bare domain (host + optional path). Anchored, so a cell like
// "France" or "News website" is ignored and only the site/URL cells are kept.
const CANDIDATE_RE = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?$/i;
// Non-site file extensions that a domain-shaped regex would otherwise match.
const NON_SITE_EXT = /\.(?:xlsx?|csv|pdf|docx?|pptx?|png|jpe?g|gif|svg|zip|txt|json|xml)$/i;

/** Extract site/feed candidates from tabular or messy text - a pasted spreadsheet
 * selection (tab/newline separated), CSV/TSV, or a mixed list. Every cell is split
 * out and only URL/domain-like cells are kept (country names, headers, blank cells
 * are dropped). Used for file import and for pasting Excel cells; the plain "Add"
 * box still uses parseFeedInput so a single comma-bearing URL stays intact. */
export function extractFeedCandidates(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const rawCell of text.split(/[\r\n\t,;|]+/)) {
    const cell = rawCell.trim().replace(/^["']+|["']+$/g, "").trim();
    if (!cell || cell.includes("@")) continue;         // skip blanks + emails
    if (!CANDIDATE_RE.test(cell)) continue;            // keep only site/URL cells
    if (NON_SITE_EXT.test(cell) && !/^https?:\/\//i.test(cell)) continue; // skip bare file names
    const key = cell.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cell);
  }
  return out;
}
