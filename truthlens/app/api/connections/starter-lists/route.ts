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
  const entries = country
    ? list.entries.filter((e) => e.country.toLowerCase() === country.toLowerCase())
    : list.entries;
  return NextResponse.json(
    { id: list.id, title: list.title, country: country || null, urls: entries.map((e) => e.url) },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
