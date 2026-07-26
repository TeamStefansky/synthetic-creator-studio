// Built-in "starter lists" of news sites the user can bulk-add to Connections.
// The list ships in the repo (data/news-sites/*.json); adding always runs through
// the same validated, SSRF-guarded discovery+add flow, so nothing is saved that
// doesn't parse as a real feed. GET with no args returns catalog metadata (id,
// title, per-country counts); GET ?id=&country= returns the site URLs to add.

import { NextResponse } from "next/server";
import europeBatch1 from "@/data/news-sites/europe-batch1.json";

export const runtime = "nodejs";

interface Entry { country: string; outlet: string; url: string }
interface StarterList { id: string; title: string; entries: Entry[] }

const LISTS: StarterList[] = [
  { id: "europe-batch1", title: "Europe — top outlets by country", entries: europeBatch1 as Entry[] },
];

function countryCounts(entries: Entry[]): { country: string; count: number }[] {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.country, (m.get(e.country) || 0) + 1);
  return [...m.entries()].map(([country, count]) => ({ country, count })).sort((a, b) => a.country.localeCompare(b.country));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const country = (searchParams.get("country") || "").trim();

  if (!id) {
    // Catalog metadata only (keeps the payload small).
    return NextResponse.json({
      lists: LISTS.map((l) => ({
        id: l.id, title: l.title, total: l.entries.length,
        countries: countryCounts(l.entries),
      })),
    }, { headers: { "Cache-Control": "public, max-age=3600" } });
  }

  const list = LISTS.find((l) => l.id === id);
  if (!list) return NextResponse.json({ error: "Unknown list." }, { status: 404 });

  let entries: Entry[];
  if (country) {
    entries = list.entries.filter((e) => e.country.toLowerCase() === country.toLowerCase());
  } else {
    // No country → return a geographic SPREAD: the top `perCountry` ranked outlets
    // from EACH country (entries are already in rank order within a country), so a
    // single capped "add all" covers all of Europe rather than just the first
    // alphabetical countries.
    const perCountry = Math.min(Math.max(parseInt(searchParams.get("perCountry") || "2", 10) || 2, 1), 10);
    const taken = new Map<string, number>();
    entries = [];
    for (const e of list.entries) {
      const n = taken.get(e.country) || 0;
      if (n >= perCountry) continue;
      taken.set(e.country, n + 1);
      entries.push(e);
    }
  }
  return NextResponse.json(
    { id: list.id, title: list.title, country: country || null, urls: entries.map((e) => e.url) },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
