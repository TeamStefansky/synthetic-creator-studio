"use client";

import type { EditionItemOut } from "@/lib/api/types";
import { StoryCard } from "./StoryCard";
import { CompactHeadline } from "./CompactHeadline";
import { type Section, sectionLabel, storyHref, TOP_SECTION } from "@/lib/edition-view";
import { useReadState } from "@/lib/read-state";

type Props = {
  sections: Section[];
  /** read-only public mode: no internal story links, no coverage anchors */
  readOnly?: boolean;
};

/** Renders an edition's sections in editorial hierarchy (not a uniform grid). */
export function EditionView({ sections, readOnly }: Props) {
  const { isRead, markRead } = useReadState();

  const href = (it: EditionItemOut) => (readOnly ? undefined : storyHref(it.story));
  const covHref = (it: EditionItemOut) =>
    readOnly ? undefined : `${storyHref(it.story)}#coverage`;

  return (
    <div className="space-y-14" onClick={() => void 0}>
      {sections.map((section) => {
        const [lead, ...rest] = section.items;
        if (!lead) return null;
        const isTop = section.name === TOP_SECTION;
        const threeUp = isTop ? rest.slice(0, 3) : [];
        const compact = isTop ? rest.slice(3) : rest;

        return (
          <section key={section.name} aria-labelledby={`sec-${section.name}`}>
            <h2
              id={`sec-${section.name}`}
              className="mb-5 border-b border-ink pb-2 font-headline text-sm font-semibold uppercase tracking-widest text-ink"
            >
              {sectionLabel(section.name)}
            </h2>

            <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
              <div onMouseDown={() => markRead(lead.story.id)}>
                <StoryCard
                  story={lead.story}
                  variant="lead"
                  storyHref={href(lead)}
                  coverageHref={covHref(lead)}
                  read={isRead(lead.story.id)}
                />
              </div>

              {threeUp.length ? (
                <div className="grid gap-6 sm:grid-cols-3 lg:grid-cols-1">
                  {threeUp.map((it) => (
                    <div key={it.story.id} onMouseDown={() => markRead(it.story.id)}>
                      <StoryCard
                        story={it.story}
                        variant="top"
                        storyHref={href(it)}
                        coverageHref={covHref(it)}
                        read={isRead(it.story.id)}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {compact.length ? (
              <div className="mt-8 grid gap-x-10 md:grid-cols-2">
                {compact.map((it) => (
                  <div key={it.story.id} onMouseDown={() => markRead(it.story.id)}>
                    <CompactHeadline
                      story={it.story}
                      storyHref={href(it)}
                      coverageHref={covHref(it)}
                      read={isRead(it.story.id)}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
