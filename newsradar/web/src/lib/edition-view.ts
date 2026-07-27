import type { EditionItemOut, EditionOut, StoryOut } from "./api/types";

export const TOP_SECTION = "top";

export type ReaderFilters = {
  interests: string[]; // section names
  countries: string[]; // ISO alpha-2
  countryMode: "source" | "subject";
  window: "6h" | "24h" | "3d" | null;
};

export function emptyFilters(): ReaderFilters {
  return { interests: [], countries: [], countryMode: "source", window: null };
}

const WINDOW_HOURS: Record<string, number> = { "6h": 6, "24h": 24, "3d": 72 };

export function storyHref(story: StoryOut): string {
  return `/site/story/${story.story_type}/${story.id}`;
}

/** Apply URL-bound filters over an already-built edition (client-side). */
export function filterItems(
  items: EditionItemOut[],
  filters: ReaderFilters,
  now: Date = new Date(),
): EditionItemOut[] {
  const cutoff = filters.window ? now.getTime() - WINDOW_HOURS[filters.window]! * 3600_000 : null;
  return items.filter((it) => {
    const s = it.story;
    if (filters.interests.length && !filters.interests.includes(it.section)) return false;
    // NOTE: StoryOut exposes only source_country, not per-story subject country,
    // so the "About" (subject) mode filters on the same field as a best effort.
    if (filters.countries.length) {
      const cc = s.source_country?.toUpperCase();
      if (!cc || !filters.countries.includes(cc)) return false;
    }
    if (cutoff !== null && s.published_at) {
      if (new Date(s.published_at).getTime() < cutoff) return false;
    }
    return true;
  });
}

export type Section = { name: string; items: EditionItemOut[] };

/** Group filtered items into sections, preserving the edition's section order. */
export function groupSections(edition: EditionOut, items: EditionItemOut[]): Section[] {
  const order =
    edition.sections && edition.sections.length
      ? edition.sections
      : [...new Set(items.map((i) => i.section))];
  return order
    .map((name) => ({ name, items: items.filter((i) => i.section === name) }))
    .filter((s) => s.items.length > 0);
}

export function sectionLabel(name: string): string {
  return name === TOP_SECTION ? "Top stories" : name;
}
