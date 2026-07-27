import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api/client";
import type { StoryOut } from "@/lib/api/types";
import { StoryBody } from "@/components/StoryBody";
import { ErrorState } from "@/components/states";
import { notFound } from "next/navigation";
import { t } from "@/lib/strings.en";

export const dynamic = "force-dynamic";

export default async function StoryPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = await params;
  if (type !== "event" && type !== "document") notFound();

  let story: StoryOut;
  try {
    story = await apiFetch<StoryOut>(`/site/story/${type}/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    return <ErrorState message={err instanceof Error ? err.message : undefined} />;
  }

  return (
    <div>
      <Link href="/site" className="text-sm text-ink-muted underline hover:text-accent">
        ← {t.story.backToFront}
      </Link>
      <div className="mt-4">
        <StoryBody story={story} />
      </div>
    </div>
  );
}
