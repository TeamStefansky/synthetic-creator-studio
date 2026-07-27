import { apiFetch, ApiError } from "@/lib/api/client";
import type { EditionOut, PublicDigestScope, PublicInterestScope } from "@/lib/api/types";
import { groupSections } from "@/lib/edition-view";
import { PublicView, type PublicMode } from "@/components/PublicView";
import { t } from "@/lib/strings.en";

export const dynamic = "force-dynamic";

type PublicResponse = EditionOut | PublicInterestScope | PublicDigestScope;

function InactivePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="max-w-md text-center">
        <h1 className="font-headline text-2xl text-ink">{t.publicView.inactiveTitle}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t.publicView.inactiveBody}</p>
      </div>
    </div>
  );
}

export default async function PublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let data: PublicResponse;
  try {
    data = await apiFetch<PublicResponse>(`/p/${token}`);
  } catch (err) {
    // Revoked (410), expired (410) or missing (404) → a clean inactive page.
    if (err instanceof ApiError && (err.status === 410 || err.status === 404)) {
      return <InactivePage />;
    }
    if (err instanceof ApiError && err.status === 429) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-paper px-4">
          <p className="text-sm text-ink-muted">Too many requests — please try again shortly.</p>
        </div>
      );
    }
    return <InactivePage />;
  }

  let mode: PublicMode;
  if ("scope" in data && data.scope === "interest") {
    mode = { kind: "interest", title: data.title, stories: data.stories };
  } else if ("scope" in data && data.scope === "digest") {
    mode = { kind: "digest", markdown: data.markdown ?? "", generatedAt: data.generated_at };
  } else {
    const edition = data as EditionOut;
    mode = {
      kind: "edition",
      sections: groupSections(edition, edition.items ?? []),
      generatedAt: edition.generated_at,
    };
  }

  return <PublicView mode={mode} />;
}
