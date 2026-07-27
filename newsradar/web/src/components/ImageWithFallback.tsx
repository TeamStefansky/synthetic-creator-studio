"use client";

import { useState } from "react";
import { t } from "@/lib/strings.en";

type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  /** favicon slots are tiny; article heroes fill their container */
  variant?: "hero" | "favicon";
};

/**
 * Hotlinks the publisher's image directly from `image_url` with
 * `referrerPolicy="no-referrer-when-downgrade"`. Images are NEVER proxied,
 * cached, downloaded or re-hosted (rights rule) — hence a plain <img>, not
 * next/image. Falls back to a neutral tile on error or when no URL is supplied.
 */
export function ImageWithFallback({ src, alt, className, variant = "hero" }: Props) {
  const [failed, setFailed] = useState(false);
  const isFavicon = variant === "favicon";

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-wash text-ink-faint ${className ?? ""}`}
        role="img"
        aria-label={isFavicon ? alt : t.a11y.imageFallback}
        data-fallback="true"
      >
        {isFavicon ? (
          <span aria-hidden className="text-[10px]">
            ◆
          </span>
        ) : (
          <span className="font-headline text-2xl opacity-40" aria-hidden>
            {t.brand}
          </span>
        )}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      onError={() => setFailed(true)}
    />
  );
}
