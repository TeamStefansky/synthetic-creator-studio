import Link from "next/link";
import type { StoryOut } from "@/lib/api/types";
import { SourceStrip } from "./SourceStrip";
import { TranslationTag } from "./TranslationTag";
import { CoverageChip } from "./CoverageChip";

type Props = {
  story: StoryOut;
  storyHref?: string;
  read?: boolean;
  coverageHref?: string;
};

/** A compact headline-list row used beneath each section's lead item. */
export function CompactHeadline({ story, storyHref, read, coverageHref }: Props) {
  const coverageCount = story.coverage?.length ?? 0;
  return (
    <article
      className={`flex flex-col gap-1 rounded border-t border-line py-3 outline-none first:border-t-0 ${
        read ? "opacity-60" : ""
      }`}
      data-story-id={story.id}
      data-story-href={storyHref}
      data-source-url={story.url}
      data-read={read ? "true" : "false"}
    >
      {storyHref ? (
        <Link href={storyHref} className="hover:text-accent">
          <h3 className="font-headline text-base leading-snug">{story.headline_en}</h3>
        </Link>
      ) : (
        <h3 className="font-headline text-base leading-snug">{story.headline_en}</h3>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <TranslationTag
          sourceLang={story.source_lang}
          headlineOriginal={story.headline_original}
          translationStatus={story.translation_status}
        />
        {story.story_type === "event" ? (
          <CoverageChip count={coverageCount} href={coverageHref} />
        ) : null}
      </div>
      <SourceStrip
        sourceName={story.source_name}
        sourceDomain={story.source_domain}
        sourceCountry={story.source_country}
        faviconUrl={story.favicon_url}
        url={story.url}
        publishedAt={story.published_at}
        size="sm"
      />
    </article>
  );
}
