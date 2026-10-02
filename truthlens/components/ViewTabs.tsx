"use client";

// Tab strip shared by every view of a consolidated tool (see lib/views.ts).
// Query strings carry over (e.g. ?entity=) so switching views keeps the subject.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { VIEW_SETS, activeView, type ViewSetId } from "@/lib/views";

function Tabs({ set }: { set: ViewSetId }) {
  const pathname = usePathname() || "";
  const qs = useSearchParams()?.toString();
  const active = activeView(set, pathname);
  return (
    <nav aria-label="Views" className="no-print flex flex-wrap gap-1 rounded-xl border border-line bg-bg-elev/60 p-1">
      {VIEW_SETS[set].views.map((v) => {
        const on = active?.href === v.href;
        return (
          <Link
            key={v.href}
            href={qs ? `${v.href}?${qs}` : v.href}
            aria-current={on ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-xs transition ${on ? "bg-gradient-brand text-white shadow-glow" : "text-ink-secondary hover:bg-white/[0.04] hover:text-white"}`}
          >
            {v.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function ViewTabs({ set }: { set: ViewSetId }) {
  // useSearchParams needs a Suspense boundary on statically rendered pages.
  return <Suspense fallback={null}><Tabs set={set} /></Suspense>;
}
