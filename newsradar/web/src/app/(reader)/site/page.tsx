import { apiFetch, ApiError } from "@/lib/api/client";
import type { EditionOut } from "@/lib/api/types";
import { FrontPage } from "@/components/FrontPage";
import { EmptyState, ErrorState } from "@/components/states";
import { t } from "@/lib/strings.en";

export const dynamic = "force-dynamic";

export default async function SitePage() {
  let edition: EditionOut;
  try {
    edition = await apiFetch<EditionOut>("/site/edition/current");
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return (
        <EmptyState
          title={t.frontPage.emptyTitle}
          body={t.frontPage.emptyBody}
          ctaHref="/sources"
          ctaLabel={t.frontPage.emptyCta}
        />
      );
    }
    return <ErrorState message={err instanceof Error ? err.message : undefined} />;
  }

  if (!edition.items?.length) {
    return (
      <EmptyState
        title={t.frontPage.emptyTitle}
        body={t.frontPage.emptyBody}
        ctaHref="/sources"
        ctaLabel={t.frontPage.emptyCta}
      />
    );
  }

  return <FrontPage edition={edition} />;
}
