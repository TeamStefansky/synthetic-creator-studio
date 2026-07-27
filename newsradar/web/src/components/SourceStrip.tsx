import { ImageWithFallback } from "./ImageWithFallback";
import { countryFlag } from "@/lib/format";
import { relativeTime } from "@/lib/format";
import { t } from "@/lib/strings.en";

type Props = {
  sourceName: string;
  sourceDomain?: string | null;
  sourceCountry?: string | null;
  faviconUrl?: string | null;
  url: string;
  publishedAt?: string | null;
  size?: "sm" | "md";
};

/**
 * The attribution unit rendered by EVERY story surface (front-page card, story
 * page, public /p variants). It always outputs: the source's favicon slot, the
 * source name, and a visible external link to the original article
 * (target="_blank" rel="noopener noreferrer"). Attribution is never truncated
 * or hidden — this is a legal requirement, not styling.
 */
export function SourceStrip({
  sourceName,
  sourceDomain,
  sourceCountry,
  faviconUrl,
  url,
  publishedAt,
  size = "md",
}: Props) {
  const iconPx = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
      <span
        data-favicon-slot="true"
        className={`inline-flex shrink-0 overflow-hidden rounded-sm ${iconPx}`}
      >
        <ImageWithFallback
          src={faviconUrl}
          alt={t.a11y.faviconAlt(sourceName)}
          variant="favicon"
          className="h-full w-full object-cover"
        />
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-ink-soft underline decoration-line underline-offset-2 hover:text-accent"
        data-source-link="true"
      >
        {sourceName}
      </a>
      {sourceCountry ? (
        <span aria-label={sourceCountry} title={sourceCountry}>
          {countryFlag(sourceCountry)}
        </span>
      ) : null}
      {publishedAt ? (
        <>
          <span aria-hidden>·</span>
          <time dateTime={publishedAt}>{relativeTime(publishedAt)}</time>
        </>
      ) : null}
      {sourceDomain ? (
        <>
          <span aria-hidden>·</span>
          <span className="text-ink-faint">{sourceDomain}</span>
        </>
      ) : null}
    </div>
  );
}
