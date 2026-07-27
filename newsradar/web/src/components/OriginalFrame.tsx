"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/strings.en";

type Props = {
  url: string;
  sourceName: string;
  frameable: boolean | null;
};

/**
 * The original-article view (presentation rule 5). When `frameable === true` the
 * publisher's own page is embedded from the publisher's own server in a sandboxed
 * iframe. If the iframe has not loaded within 4 seconds — or `frameable` is false
 * or null — we fall back to a large "Read the full article on {source}" CTA and
 * render NO iframe. We never scrape, screenshot, or strip the publisher's chrome.
 */
export function OriginalFrame({ url, sourceName, frameable }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (frameable !== true) return;
    timer.current = setTimeout(() => {
      if (!loaded) setTimedOut(true);
    }, 4000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [frameable, loaded]);

  const showFrame = frameable === true && !timedOut;

  const OpenButton = ({ big }: { big?: boolean }) => (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={
        big
          ? "inline-block rounded bg-accent px-5 py-3 text-base font-semibold text-paper hover:opacity-90"
          : "inline-block rounded border border-ink px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink hover:text-paper"
      }
    >
      {big ? t.story.readFullOn(sourceName) : t.story.openOn(sourceName)}
    </a>
  );

  return (
    <section className="mt-10" aria-label={t.story.originalHeading(sourceName)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
        <h2 className="font-headline text-lg text-ink">
          {t.story.originalHeading(sourceName)}
        </h2>
        <OpenButton />
      </div>

      {showFrame ? (
        <div className="overflow-hidden rounded-lg border border-line bg-wash">
          <iframe
            src={url}
            title={t.story.originalHeading(sourceName)}
            className="h-[70vh] w-full"
            sandbox="allow-scripts allow-same-origin allow-popups"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setLoaded(true)}
          />
        </div>
      ) : (
        <div
          data-frame-fallback="true"
          className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line bg-wash px-6 py-12 text-center"
        >
          <p className="text-sm text-ink-muted">{t.story.frameBlockedNote}</p>
          <OpenButton big />
        </div>
      )}
    </section>
  );
}
