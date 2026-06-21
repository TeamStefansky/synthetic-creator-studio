"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { BarChart3, Users, Wand2, Send, Menu, X, ShieldCheck } from "lucide-react";
import { DisclosureBadge } from "./DisclosureBadge";

const NAV = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/personas", label: "Personas", icon: Users },
  { href: "/studio", label: "Studio", icon: Wand2 },
  { href: "/distribution", label: "Distribution", icon: Send },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={clsx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
              active ? "bg-brand-600 text-white shadow-soft" : "text-slate-600 hover:bg-slate-100",
            )}
          >
            <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-soft">
        <ShieldCheck className="h-5 w-5" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-bold text-ink-900">Synthetic Creator</span>
        <span className="text-[11px] font-medium text-slate-400">Studio</span>
      </span>
    </Link>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1400px]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-slate-200/80 bg-white/70 px-4 py-5 backdrop-blur lg:flex">
        <div>
          <div className="px-2">
            <Brand />
          </div>
          <div className="mt-8">
            <NavLinks />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <DisclosureBadge />
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Every persona &amp; asset is openly labeled AI and carries embedded provenance. No publish without disclosure.
          </p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
          <Brand />
          <button
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        {/* Mobile drawer */}
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-0 flex h-full w-72 max-w-[80%] animate-fade-in flex-col gap-6 bg-white p-5 shadow-card">
              <div className="flex items-center justify-between">
                <Brand />
                <button aria-label="Close menu" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <NavLinks onNavigate={() => setOpen(false)} />
              <div className="mt-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <DisclosureBadge />
              </div>
            </div>
          </div>
        )}

        {process.env.NEXT_PUBLIC_DEMO === "1" && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800">
            Static demo — runs entirely in your browser with sample data (no backend). Actions are simulated.
          </div>
        )}
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
