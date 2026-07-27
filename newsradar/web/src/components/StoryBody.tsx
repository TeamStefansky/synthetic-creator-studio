import type { StoryOut } from "@/lib/api/types";
import { ImageWithFallback } from "./ImageWithFallback";
import { SourceStrip } from "./SourceStrip";
import { ReasonLine } from "./ReasonLine";
import { TranslationTag } from "./TranslationTag";
import { CoverageTimeline } from "./CoverageTimeline";
import { OriginalFrame } from "./OriginalFrame";
import { isRtl } from "@/lib/format";
import { t } from "@/lib/strings.en";

type Props = {
  story: StoryOut;
  /** read-only public mode hides nothing here — attribution & framing are identical */
  readOnly?: boolean;
};

/**
 * The full story-page article. Renders EXACTLY the serializer's fields:
 * translated headline, original headline beneath (when it differs), byline,
 * source strip, hero image, blurb, the capped `extract_en` (its own node, never
 * concatenated with blurb), and — only when the source is full_ok — `body_en`.
 * Then the coverage timeline and the original-article frame.
 */
export function StoryBody({ story }: Props) {
  const showOriginal =
    !!story.headline_original && story.headline_original !== story.headline_en;

  return (
    <article
      data-story-id={story.id}
      data-source-url={story.url}
      className="mx-auto max-w-3xl"
    >
      <ReasonLine reason={story.reason} />

      <h1 className="mt-2 font-headline text-display leading-tight text-ink">
        {story.headline_en}
      </h1>

      {showOriginal ? (
        <p
          dir={isRtl(story.source_lang) ? "rtl" : "auto"}
          lang={story.source_lang ?? undefined}
          className="mt-2 font-headline text-xl text-ink-muted"
        >
          {story.headline_original}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <TranslationTag
          sourceLang={story.source_lang}
          headlineOriginal={story.headline_original}
          translationStatus={story.translation_status}
        />
        {story.byline ? (
          <span className="text-sm text-ink-muted">{t.story.byline(story.byline)}</span>
        ) : null}
      </div>

      <div className="mt-3 border-y border-line py-3">
        <SourceStrip
          sourceName={story.source_name}
          sourceDomain={story.source_domain}
          sourceCountry={story.source_country}
          faviconUrl={story.favicon_url}
          url={story.url}
          publishedAt={story.published_at}
        />
      </div>

      {story.image_url ? (
        <figure className="mt-6">
          <div className="overflow-hidden rounded-lg bg-wash">
            <ImageWithFallback
              src={story.image_url}
              alt={story.image_alt ?? story.headline_en}
              className="max-h-[60vh] w-full object-cover"
            />
          </div>
          {story.image_alt ? (
            <figcaption className="mt-2 text-xs text-ink-faint">{story.image_alt}</figcaption>
          ) : null}
        </figure>
      ) : null}

      <div className="reading-column mt-6 text-lg text-ink-soft">
        {story.blurb ? <p className="font-medium text-ink">{story.blurb}</p> : null}
        {/* extract_en is rendered as-is in its OWN node — never concatenated with
            blurb, never enriched from any other endpoint (rights + extract gate). */}
        {story.extract_en ? <p data-extract="true">{story.extract_en}</p> : null}
        {/* body_en is present ONLY for full_ok sources (server-enforced). */}
        {story.body_en ? (
          <div data-body="true" className="mt-4 whitespace-pre-line border-t border-line pt-4">
            {story.body_en}
          </div>
        ) : null}
      </div>

      {story.coverage && story.coverage.length ? (
        <CoverageTimeline coverage={story.coverage} />
      ) : null}

      <OriginalFrame url={story.url} sourceName={story.source_name} frameable={story.frameable} />
    </article>
  );
}
