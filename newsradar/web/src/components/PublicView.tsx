"use client";

import type { StoryOut } from "@/lib/api/types";
import { StoryCard } from "./StoryCard";
import { EditionView } from "./EditionView";
import { MarkdownView } from "./MarkdownView";
import type { Section } from "@/lib/edition-view";
import { clockTime } from "@/lib/format";
import { t } from "@/lib/strings.en";

type EditionMode = { kind: "edition"; sections: Section[]; generatedAt: string };
type InterestMode = { kind: "interest"; title: string; stories: StoryOut[] };
type DigestMode = { kind: "digest"; markdown: string; generatedAt: string };

export type PublicMode = EditionMode | InterestMode | DigestMode;

/** The read-only public surface: same story components, no settings nav, no
 *  refresh, no filter persistence. */
export function PublicView({ mode }: { mode: PublicMode }) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto max-w-reader px-4 py-3">
          <span className="font-headline text-2xl tracking-tight text-ink">{t.brand}</span>
          <span className="ml-3 text-xs text-ink-faint">Shared view</span>
        </div>
      </header>
      <main className="mx-auto max-w-reader px-4 py-8">
        {mode.kind === "edition" ? (
          <>
            <h1 className="mb-6 font-headline text-2xl text-ink">
              {t.frontPage.edition(clockTime(mode.generatedAt))}
            </h1>
            <EditionView sections={mode.sections} readOnly />
          </>
        ) : mode.kind === "interest" ? (
          <>
            <h1 className="mb-6 font-headline text-2xl text-ink">{mode.title}</h1>
            <div className="grid gap-8 md:grid-cols-2">
              {mode.stories.map((s) => (
                <StoryCard key={s.id} story={s} variant="top" read={false} />
              ))}
            </div>
          </>
        ) : (
          <>
            <h1 className="mb-6 font-headline text-2xl text-ink">{t.digest.title}</h1>
            <MarkdownView markdown={mode.markdown} />
          </>
        )}
      </main>
    </div>
  );
}
