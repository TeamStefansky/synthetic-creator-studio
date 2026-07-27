"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { EditionOut } from "@/lib/api/types";
import { EditionHeader } from "./EditionHeader";
import { FilterBar } from "./FilterBar";
import { EditionView } from "./EditionView";
import { EmptyState } from "./states";
import { useKeyboardNav } from "@/lib/use-keyboard-nav";
import { type ReaderFilters, filterItems, groupSections } from "@/lib/edition-view";
import { t } from "@/lib/strings.en";

function parseFilters(search: URLSearchParams): ReaderFilters {
  const list = (k: string) =>
    (search.get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const win = search.get("window");
  return {
    interests: list("interests"),
    countries: list("countries").map((c) => c.toUpperCase()),
    countryMode: search.get("cmode") === "subject" ? "subject" : "source",
    window: win === "6h" || win === "24h" || win === "3d" ? win : null,
  };
}

export function FrontPage({ edition }: { edition: EditionOut }) {
  const search = useSearchParams();
  useKeyboardNav(true);

  const filters = useMemo(() => parseFilters(new URLSearchParams(search.toString())), [search]);
  const q = search.get("q")?.trim().toLowerCase() ?? "";

  const sections = useMemo(() => {
    let items = filterItems(edition.items ?? [], filters);
    if (q) {
      items = items.filter(
        (it) =>
          it.story.headline_en.toLowerCase().includes(q) ||
          (it.story.blurb ?? "").toLowerCase().includes(q) ||
          it.story.source_name.toLowerCase().includes(q),
      );
    }
    return groupSections(edition, items);
  }, [edition, filters, q]);

  return (
    <div>
      <EditionHeader generatedAt={edition.generated_at} itemCount={edition.item_count} />
      <FilterBar sections={edition.sections ?? []} filters={filters} />
      {sections.length ? (
        <EditionView sections={sections} />
      ) : (
        <EmptyState title={t.states.empty} body={t.filters.clear} />
      )}
    </div>
  );
}
