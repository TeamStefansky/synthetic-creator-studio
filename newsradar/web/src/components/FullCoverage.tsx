import type { FullCoverageOut } from "@/lib/api/types";
import { countryFlag, countryLabel, fullDateTime } from "@/lib/format";
import { t } from "@/lib/strings.en";

/**
 * "Full coverage" (P8) — the Google-News-style breakdown for an event story.
 * Coverage is grouped into ANGLES (framing sub-clusters), plus a by-country
 * facet and an entity-targeted stance summary. Attribution only: every outlet is
 * an outbound link to the original article; no body text is shown. Stance is
 * rendered only when actually assessed (honest — never inferred).
 */
export function FullCoverage({ coverage }: { coverage: FullCoverageOut }) {
  const { angles, by_country: byCountry, stance } = coverage;
  const stanceTotal = stance.supportive + stance.critical + stance.neutral + stance.unassessed;

  return (
    <section id="full-coverage" className="mt-12 scroll-mt-20 border-t border-line pt-8">
      <h2 className="font-headline text-lg text-ink">{t.story.fullCoverage}</h2>
      <p className="mb-6 text-sm text-ink-muted">{t.story.fullCoverageIntro}</p>

      {/* Stance summary — only when assessed. */}
      <div className="mb-8">
        <h3 className="mb-2 text-sm font-semibold text-ink-soft">{t.story.stanceHeading}</h3>
        {stance.assessed ? (
          <div>
            <div
              className="flex h-2.5 w-full overflow-hidden rounded-full bg-wash"
              role="img"
              aria-label={t.story.stanceHeading}
            >
              {stance.supportive > 0 ? (
                <span
                  className="bg-emerald-600"
                  style={{ width: `${(stance.supportive / stanceTotal) * 100}%` }}
                />
              ) : null}
              {stance.critical > 0 ? (
                <span
                  className="bg-rose-600"
                  style={{ width: `${(stance.critical / stanceTotal) * 100}%` }}
                />
              ) : null}
              {stance.neutral > 0 ? (
                <span
                  className="bg-slate-400"
                  style={{ width: `${(stance.neutral / stanceTotal) * 100}%` }}
                />
              ) : null}
              {stance.unassessed > 0 ? (
                <span
                  className="bg-line"
                  style={{ width: `${(stance.unassessed / stanceTotal) * 100}%` }}
                />
              ) : null}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
              <li>
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-600 align-middle" />
                {t.story.stanceSupportive} · {stance.supportive}
              </li>
              <li>
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-600 align-middle" />
                {t.story.stanceCritical} · {stance.critical}
              </li>
              <li>
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-400 align-middle" />
                {t.story.stanceNeutral} · {stance.neutral}
              </li>
              {stance.unassessed > 0 ? (
                <li>
                  <span className="mr-1 inline-block h-2 w-2 rounded-full bg-line align-middle" />
                  {t.story.stanceUnassessed} · {stance.unassessed}
                </li>
              ) : null}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-ink-faint">{t.story.stanceNotAssessed}</p>
        )}
      </div>

      {/* By-country facet. */}
      {byCountry.length ? (
        <div className="mb-8">
          <h3 className="mb-2 text-sm font-semibold text-ink-soft">{t.story.byCountry}</h3>
          <ul className="flex flex-wrap gap-2">
            {byCountry.map((c) => (
              <li
                key={c.country ?? "unknown"}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-wash px-2.5 py-1 text-xs text-ink-soft"
              >
                {c.country ? <span aria-hidden>{countryFlag(c.country)}</span> : null}
                <span>{c.country ? countryLabel(c.country) : "—"}</span>
                <span className="text-ink-faint">{c.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Angle cards. */}
      <div className="grid gap-4 sm:grid-cols-2">
        {angles.map((angle, i) => (
          <div key={`${angle.label}-${i}`} className="rounded-lg border border-line p-4">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="font-headline text-base leading-snug text-ink">{angle.label}</h3>
              <span className="shrink-0 text-xs text-ink-faint">
                {t.story.angleOutlets(angle.size)}
              </span>
            </div>
            <ul className="space-y-1.5">
              {angle.outlets.map((o, j) => (
                <li key={`${o.url}-${j}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  {o.source_country ? (
                    <span aria-label={o.source_country}>{countryFlag(o.source_country)}</span>
                  ) : null}
                  <a
                    href={o.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-ink-soft underline decoration-line underline-offset-2 hover:text-accent"
                  >
                    {o.source_name}
                  </a>
                  {o.published_at ? (
                    <time dateTime={o.published_at} className="text-xs text-ink-faint">
                      {fullDateTime(o.published_at)}
                    </time>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
