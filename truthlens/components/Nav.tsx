"use client";

// Aurora Dark shell: an icon-led sidebar with gradient tiles (desktop) that
// collapses to a top bar + slide-over drawer (mobile). Active item = gradient
// tile + glow. One shell, every page. Routes and behavior unchanged.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Eye, FileSearch, Mail, ScrollText, Activity, Info, ShieldQuestion, Radar,
  CheckCircle, History, Menu, X, Server, Globe, Radio, Globe2, Plug, HeartHandshake,
} from "lucide-react";

const links = [
  { href: "/check", label: "Check", icon: CheckCircle, match: (p: string) => p.startsWith("/check") },
  { href: "/platform", label: "Brand Watch", icon: Radar, match: (p: string) => p.startsWith("/platform") },
  { href: "/tools/mentions", label: "Brand Mentions", icon: Globe, match: (p: string) => p.startsWith("/tools/mentions") },
  { href: "/tools/signal", label: "SIGNAL Grid", icon: Radio, match: (p: string) => p.startsWith("/tools/signal") },
  { href: "/tools/geopolitics", label: "Geopolitics", icon: Globe2, match: (p: string) => p.startsWith("/tools/geopolitics") },
  { href: "/history", label: "History", icon: History, match: (p: string) => p.startsWith("/history") },
  { href: "/", label: "Site Report", icon: FileSearch, match: (p: string) => p === "/" || p.startsWith("/report") },
  { href: "/tools/post", label: "Post Check", icon: ShieldQuestion, match: (p: string) => p.startsWith("/tools/post") },
  { href: "/tools/logs", label: "Log Analyzer", icon: ScrollText, match: (p: string) => p.startsWith("/tools/logs") },
  { href: "/tools/email", label: "Email Tracer", icon: Mail, match: (p: string) => p.startsWith("/tools/email") },
  { href: "/tools/origin", label: "Origin Exposure", icon: Server, match: (p: string) => p.startsWith("/tools/origin") },
  { href: "/tools/ngo", label: "Nonprofit Registry", icon: HeartHandshake, match: (p: string) => p.startsWith("/tools/ngo") },
  { href: "/monitor", label: "Monitor", icon: Activity, match: (p: string) => p.startsWith("/monitor") },
  { href: "/status", label: "Connections", icon: Plug, match: (p: string) => p.startsWith("/status") },
  { href: "/about", label: "About", icon: Info, match: (p: string) => p.startsWith("/about") },
];

function Wordmark() {
  return (
    <Link href="/" className="group flex items-center gap-2.5 font-semibold">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-brand shadow-glow transition group-hover:scale-105">
        <Eye className="h-5 w-5 animate-blink text-white [transform-origin:center]" />
      </span>
      <span className="text-[15px] tracking-tight text-white">
        Truth<span className="text-brand-soft">Lens</span>
      </span>
    </Link>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {links.map(({ href, label, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm transition ${
              active ? "bg-bg-elev text-white" : "text-ink-secondary hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${
                active
                  ? "bg-gradient-brand text-white shadow-glow"
                  : "border border-line bg-bg-elev text-ink-secondary"
              }`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col gap-4 border-r border-line bg-bg-base px-3 py-4 lg:flex">
        <div className="px-1">
          <Wordmark />
        </div>
        <NavItems />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg-base/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Wordmark />
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink-secondary transition hover:text-white"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col gap-4 border-r border-line bg-bg-card px-3 py-4">
            <div className="flex items-center justify-between px-1">
              <Wordmark />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-secondary transition hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavItems onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
