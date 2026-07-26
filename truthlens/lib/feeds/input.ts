// Parse the Connections paste box into a list of URLs.
//
// Separators are whitespace (newlines/spaces) or a comma/semicolon that is FOLLOWED
// by whitespace. A BARE comma is NOT a separator: URLs can legitimately contain
// commas (e.g. Ynet's https://www.ynet.co.il/home/0,7340,L-8,00.html), and splitting
// on every comma shredded such a URL into invalid fragments. No node deps — safe to
// import from the client component and unit-test.
export function parseFeedInput(input: string): string[] {
  return [...new Set(
    input
      .split(/\s+|[,;](?=\s)/)
      .map((s) => s.trim().replace(/[,;]+$/, ""))
      .filter(Boolean),
  )];
}
