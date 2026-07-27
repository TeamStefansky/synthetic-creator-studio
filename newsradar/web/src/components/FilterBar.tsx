"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { t } from "@/lib/strings.en";
import { COUNTRIES } from "@/lib/countries";
import { countryFlag } from "@/lib/format";
import type { ReaderFilters } from "@/lib/edition-view";
import { sectionLabel } from "@/lib/edition-view";

type Props = {
  /** Section names available in the current edition (for the interest multi-select). */
  sections: string[];
  filters: ReaderFilters;
};

const WINDOWS: { value: "6h" | "24h" | "3d"; label: string }[] = [
  { value: "6h", label: t.filters.window6h },
  { value: "24h", label: t.filters.window24h },
  { value: "3d", label: t.filters.window3d },
];

/** Filter bar bound to URL search params so every view is shareable. */
export function FilterBar({ sections, filters }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const commit = useCallback(
    (next: Partial<Record<string, string | null>>) => {
      const params = new URLSearchParams(search.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v == null || v === "") params.delete(k);
        else params.set(k, v);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, search],
  );

  const toggleInList = (key: string, current: string[], value: string) => {
    const set = new Set(current);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    commit({ [key]: set.size ? [...set].join(",") : null });
  };

  const interestSections = sections.filter((s) => s !== "top");

  return (
    <section
      aria-label={t.filters.heading}
      className="mb-8 flex flex-col gap-4 rounded-lg border border-line bg-wash p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="filter-search" className="sr-only">
          {t.filters.heading}
        </label>
        <input
          id="filter-search"
          data-filter-focus
          type="text"
          placeholder={t.filters.heading + " (press / )"}
          defaultValue={search.get("q") ?? ""}
          onChange={(e) => commit({ q: e.target.value || null })}
          className="min-w-[12rem] flex-1 rounded border border-line bg-paper px-3 py-1.5 text-sm"
        />
        {/* Country mode toggle — plain-language labels */}
        <div className="flex items-center overflow-hidden rounded border border-line text-xs">
          <button
            type="button"
            onClick={() => commit({ cmode: "source" })}
            aria-pressed={filters.countryMode === "source"}
            className={`px-3 py-1.5 ${
              filters.countryMode === "source" ? "bg-ink text-paper" : "bg-paper text-ink-soft"
            }`}
            title={t.filters.publishedInHint}
          >
            {t.filters.publishedIn}
          </button>
          <button
            type="button"
            onClick={() => commit({ cmode: "subject" })}
            aria-pressed={filters.countryMode === "subject"}
            className={`px-3 py-1.5 ${
              filters.countryMode === "subject" ? "bg-ink text-paper" : "bg-paper text-ink-soft"
            }`}
            title={t.filters.aboutHint}
          >
            {t.filters.about}
          </button>
        </div>
      </div>

      {interestSections.length ? (
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="mr-2 inline text-xs font-medium uppercase tracking-wide text-ink-faint">
            {t.filters.interests}
          </legend>
          {interestSections.map((s) => {
            const active = filters.interests.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                onClick={() => toggleInList("interests", filters.interests, s)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  active
                    ? "border-ink bg-ink text-paper"
                    : "border-line bg-paper text-ink-soft hover:border-ink"
                }`}
              >
                {sectionLabel(s)}
              </button>
            );
          })}
        </fieldset>
      ) : null}

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mr-2 inline text-xs font-medium uppercase tracking-wide text-ink-faint">
          {t.filters.countries}
        </legend>
        {COUNTRIES.slice(0, 12).map((c) => {
          const active = filters.countries.includes(c.code);
          return (
            <button
              key={c.code}
              type="button"
              aria-pressed={active}
              onClick={() => toggleInList("countries", filters.countries, c.code)}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                active
                  ? "border-ink bg-ink text-paper"
                  : "border-line bg-paper text-ink-soft hover:border-ink"
              }`}
              title={c.name}
            >
              {countryFlag(c.code)} {c.code}
            </button>
          );
        })}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-ink-faint">
          {t.filters.window}
        </span>
        {WINDOWS.map((w) => (
          <button
            key={w.value}
            type="button"
            aria-pressed={filters.window === w.value}
            onClick={() => commit({ window: filters.window === w.value ? null : w.value })}
            className={`rounded border px-3 py-1 text-xs ${
              filters.window === w.value
                ? "border-ink bg-ink text-paper"
                : "border-line bg-paper text-ink-soft hover:border-ink"
            }`}
          >
            {w.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            commit({ interests: null, countries: null, window: null, cmode: null, q: null })
          }
          className="ml-auto text-xs text-ink-muted underline hover:text-accent"
        >
          {t.filters.clear}
        </button>
      </div>
    </section>
  );
}
