"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/lib/strings.en";

const NAV = [
  { href: "/site", label: t.nav.frontPage },
  { href: "/sources", label: t.nav.sources },
  { href: "/interests", label: t.nav.interests },
  { href: "/site/digest", label: t.nav.digest },
  { href: "/share", label: t.nav.share },
  { href: "/site/archive", label: t.nav.archive },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex max-w-reader flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/site" className="font-headline text-2xl tracking-tight text-ink">
          {t.brand}
        </Link>
        {/* Surface switcher — News is the reader surface; Monitoring is the
            (Hebrew/RTL) analyst dashboard, not part of this build. */}
        <div className="flex items-center gap-1 rounded-full border border-line bg-wash p-0.5 text-xs">
          <span className="rounded-full bg-paper px-3 py-1 font-medium text-ink shadow-sm">
            {t.nav.news}
          </span>
          <span className="cursor-not-allowed px-3 py-1 text-ink-faint" aria-disabled>
            {t.nav.monitoring}
          </span>
        </div>
        <nav className="ml-auto flex flex-wrap items-center gap-1 text-sm">
          {NAV.map((item) => {
            const active =
              item.href === "/site"
                ? pathname === "/site"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded px-3 py-1.5 transition-colors ${
                  active
                    ? "bg-ink text-paper"
                    : "text-ink-soft hover:bg-wash hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
