import Link from "next/link";
import type { StoryOut } from "@/lib/api/types";
import { ImageWithFallback } from "./ImageWithFallback";
import { SourceStrip } from "./SourceStrip";
import { ReasonLine } from "./ReasonLine";
import { TranslationTag } from "./TranslationTag";
import { CoverageChip } from "./CoverageChip";

export type StoryCardVariant = "lead" | "top" | "compact";

type Props = {
  story: StoryOut;
  variant?: StoryCardVariant;
  /** Internal story-page link. Omitted in read-only public mode. */
  storyHref?: string;
  /** localStorage read-state — read items dim slightly. */
  read?: boolean;
  /** Coverage list link target for the chip (story page anchor). */
  coverageHref?: string;
};

/**
 * The front-page article card. Renders EXACTLY the fields the serializer emits:
 * translated headline, the edition `blurb` (never `extract_en` here — and never
 * concatenated with it), source strip with favicon + name + outbound link,
 * reason line, translation tag, and coverage chip.
 */
export function StoryCard({ story, variant = "top", storyHref, read, coverageHref }: Props) {
  const coverageCount = story.coverage?.length ?? 0;

  const Headline = () => {
    const cls =
      variant === "lead"
        ? "font-headline text-display leading-tight"
        : variant === "top"
          ? "font-headline text-headline leading-snug"
          : "font-headline text-lg leading-snug";
    if (storyHref) {
      return (
        <Link href={storyHref} className="hover:text-accent">
          <h2 className={cls}>{story.headline_en}</h2>
        </Link>
      );
    }
    return <h2 className={cls}>{story.headline_en}</h2>;
  };

  return (
    <article
      className={`group flex flex-col gap-3 rounded-lg outline-none ${read ? "opacity-60" : ""}`}
      data-story-id={story.id}
      data-story-href={storyHref}
      data-source-url={story.url}
      data-read={read ? "true" : "false"}
    >
      {variant !== "compact" ? (
        <div
          className={`overflow-hidden rounded-lg bg-wash ${
            variant === "lead" ? "aspect-[16/9]" : "aspect-[3/2]"
          }`}
        >
          <ImageWithFallback
            src={story.image_url}
            alt={story.image_alt ?? story.headline_en}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <ReasonLine reason={story.reason} />
        <Headline />

        {variant === "lead" && story.blurb ? (
          <p className="reading-column text-base text-ink-soft">{story.blurb}</p>
        ) : null}

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
          size={variant === "compact" ? "sm" : "md"}
        />
      </div>
    </article>
  );
}
