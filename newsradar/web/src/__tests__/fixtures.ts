import type { EditionOut, StoryOut } from "@/lib/api/types";

export function makeStory(overrides: Partial<StoryOut> = {}): StoryOut {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    story_type: "event",
    headline_en: "Grid operator restores power to eastern regions",
    headline_original: "מפעיל הרשת החזיר את החשמל לאזורים המזרחיים",
    source_lang: "he",
    translation_status: "ok",
    extract_en:
      "The national grid operator said supply was restored to most homes after emergency repairs overnight.",
    body_en: null,
    blurb: "Power returned to hundreds of thousands after overnight repairs.",
    source_name: "Haaretz",
    source_domain: "haaretz.com",
    source_country: "IL",
    favicon_url: "https://haaretz.com/favicon.ico",
    image_url: "https://haaretz.com/img/lead.jpg",
    image_alt: "Repair crews at a substation",
    byline: "A. Cohen",
    published_at: "2026-07-27T12:00:00Z",
    url: "https://haaretz.com/news/story-123",
    frameable: true,
    reason: "Ukraine energy · 9 sources · 2h ago",
    personal_score: 0.82,
    coverage: [
      {
        source_name: "Reuters",
        url: "https://reuters.com/a",
        published_at: "2026-07-27T09:00:00Z",
        source_country: "GB",
      },
      {
        source_name: "Haaretz",
        url: "https://haaretz.com/news/story-123",
        published_at: "2026-07-27T12:00:00Z",
        source_country: "IL",
      },
    ],
    ...overrides,
  };
}

export function makeEnglishStory(overrides: Partial<StoryOut> = {}): StoryOut {
  return makeStory({
    source_lang: "en",
    translation_status: "passthrough",
    headline_original: "Grid operator restores power to eastern regions",
    source_name: "Reuters",
    source_country: "GB",
    story_type: "document",
    coverage: null,
    ...overrides,
  });
}

export function makeEdition(overrides: Partial<EditionOut> = {}): EditionOut {
  const lead = makeStory();
  return {
    id: "99999999-9999-9999-9999-999999999999",
    generated_at: "2026-07-27T12:30:00Z",
    lookback_hours: 24,
    item_count: 2,
    sections: ["top", "Ukraine energy"],
    items: [
      { position: 0, section: "top", story: lead },
      {
        position: 1,
        section: "Ukraine energy",
        story: makeEnglishStory({ id: "22222222-2222-2222-2222-222222222222" }),
      },
    ],
    ...overrides,
  };
}
