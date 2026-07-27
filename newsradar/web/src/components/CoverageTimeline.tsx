import type { CoverageItemOut } from "@/lib/api/types";
import { countryFlag, fullDateTime } from "@/lib/format";
import { t } from "@/lib/strings.en";

/**
 * The Coverage timeline for event-backed stories: every outlet that covered it,
 * ascending by publish time, each with a country flag and its own outbound link
 * — so the reader sees who broke it first and how it spread.
 */
export function CoverageTimeline({ coverage }: { coverage: CoverageItemOut[] }) {
  if (!coverage.length) return null;
  return (
    <section id="coverage" className="mt-10 scroll-mt-20">
      <h2 className="font-headline text-lg text-ink">{t.story.coverage}</h2>
      <p className="mb-4 text-sm text-ink-muted">{t.story.coverageIntro}</p>
      <ol className="relative space-y-4 border-l border-line pl-5">
        {coverage.map((c, i) => (
          <li key={`${c.url}-${i}`} className="relative">
            <span
              aria-hidden
              className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full border border-paper bg-ink"
            />
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
              {c.source_country ? (
                <span aria-label={c.source_country}>{countryFlag(c.source_country)}</span>
              ) : null}
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-ink-soft underline decoration-line underline-offset-2 hover:text-accent"
              >
                {c.source_name}
              </a>
              {c.published_at ? (
                <time dateTime={c.published_at} className="text-xs text-ink-faint">
                  {fullDateTime(c.published_at)}
                </time>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
