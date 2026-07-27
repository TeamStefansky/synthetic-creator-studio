import Link from "next/link";
import { t } from "@/lib/strings.en";

export function EmptyState({
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  body: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-line bg-wash px-6 py-12 text-center">
      <h2 className="font-headline text-xl text-ink">{title}</h2>
      <p className="mt-2 text-sm text-ink-muted">{body}</p>
      {ctaHref && ctaLabel ? (
        <Link
          href={ctaHref}
          className="mt-5 inline-block rounded bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-accent"
        >
          {ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="mx-auto max-w-md rounded-lg border border-accent-soft bg-wash px-6 py-10 text-center"
    >
      <h2 className="font-headline text-xl text-ink">{t.states.errorTitle}</h2>
      <p className="mt-2 text-sm text-ink-muted">{message ?? t.states.empty}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded border border-ink px-4 py-2 text-sm font-medium text-ink hover:bg-ink hover:text-paper"
        >
          {t.states.retry}
        </button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-line ${className}`} aria-hidden />;
}

/** Front-page-shaped skeleton: a lead block + a 3-up row. */
export function FrontPageSkeleton() {
  return (
    <div className="space-y-10" aria-busy>
      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <div className="space-y-3">
          <Skeleton className="aspect-[16/9] w-full" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-[3/2] w-full" />
              <Skeleton className="h-5 w-5/6" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
