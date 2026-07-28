"use client";

// Aurora Dark shell: an icon-led sidebar with gradient tiles (desktop) that
// collapses to a top bar + slide-over drawer (mobile). Active item = gradient
// tile + glow. One shell, every page. Routes and behavior unchanged.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  FileSearch, Mail, ScrollText, Activity, Info, ShieldQuestion, Radar,
  CheckCircle, History, Menu, X, Server, Globe, Radio, Globe2, Plug, HeartHandshake, Network, Share2,
  ShieldAlert, Coins, Bot, LogOut, Rss, Newspaper, MapPin,
} from "lucide-react";

// Six mission hubs. The flat tool list is grouped into the areas of the mission:
// analyze an asset, monitor narratives, investigate connections, look up entities,
// read the geopolitical picture, and system pages. Every tool keeps its own route
// (deep links unchanged); the menu now reads as six areas instead of 21 items.
type NavLink = { href: string; label: string; icon: any; match: (p: string) => boolean };
type NavGroup = { group: string; items: NavLink[] };

const groups: NavGroup[] = [
  {
    group: "Analyze",
    items: [
      { href: "/check", label: "Check", icon: CheckCircle, match: (p) => p.startsWith("/check") },
      { href: "/", label: "Site Report", icon: FileSearch, match: (p) => p === "/" || p.startsWith("/report") },
      { href: "/tools/post", label: "Post Check", icon: ShieldQuestion, match: (p) => p.startsWith("/tools/post") },
      { href: "/tools/logs", label: "Log Analyzer", icon: ScrollText, match: (p) => p.startsWith("/tools/logs") },
      { href: "/tools/email", label: "Email Tracer", icon: Mail, match: (p) => p.startsWith("/tools/email") },
      { href: "/tools/origin", label: "Origin Exposure", icon: Server, match: (p) => p === "/tools/origin" || p.startsWith("/tools/origin/") },
      { href: "/tools/origin-map", label: "Origin Map", icon: MapPin, match: (p) => p.startsWith("/tools/origin-map") },
    ],
  },
  {
    group: "Monitor",
    items: [
      { href: "/platform", label: "Brand Watch", icon: Radar, match: (p) => p.startsWith("/platform") },
      { href: "/tools/mentions", label: "Brand Mentions", icon: Globe, match: (p) => p.startsWith("/tools/mentions") },
      { href: "/tools/signal", label: "SIGNAL Grid", icon: Radio, match: (p) => p.startsWith("/tools/signal") },
      { href: "/newsroom", label: "News Room", icon: Newspaper, match: (p) => p.startsWith("/newsroom") },
      { href: "/monitor", label: "Monitor", icon: Activity, match: (p) => p.startsWith("/monitor") },
    ],
  },
  {
    group: "Investigate",
    items: [
      { href: "/tools/linkboard", label: "Link Board", icon: Share2, match: (p) => p.startsWith("/tools/linkboard") },
      { href: "/tools/relboard", label: "Relationship Board", icon: Network, match: (p) => p.startsWith("/tools/relboard") },
      { href: "/case", label: "Case Synthesis", icon: ScrollText, match: (p) => p.startsWith("/case") },
      { href: "/investigator", label: "The Investigator", icon: Bot, match: (p) => p.startsWith("/investigator") },
    ],
  },
  {
    group: "Entities",
    items: [
      { href: "/tools/sanctions", label: "Sanctions Screening", icon: ShieldAlert, match: (p) => p.startsWith("/tools/sanctions") },
      { href: "/tools/ngo", label: "Nonprofit Registry", icon: HeartHandshake, match: (p) => p.startsWith("/tools/ngo") },
      { href: "/tools/crypto", label: "Crypto OSINT", icon: Coins, match: (p) => p.startsWith("/tools/crypto") },
    ],
  },
  {
    group: "Geopolitics",
    items: [
      { href: "/tools/geopolitics", label: "Geopolitics", icon: Globe2, match: (p) => p.startsWith("/tools/geopolitics") },
    ],
  },
  {
    group: "Connections",
    items: [
      { href: "/connections", label: "Feed Sources", icon: Rss, match: (p) => p.startsWith("/connections") },
    ],
  },
  {
    group: "System",
    items: [
      { href: "/history", label: "History", icon: History, match: (p) => p.startsWith("/history") },
      { href: "/status", label: "Connections", icon: Plug, match: (p) => p.startsWith("/status") },
      { href: "/about", label: "About", icon: Info, match: (p) => p.startsWith("/about") },
    ],
  },
];

function Wordmark() {
  return (
    <Link href="/" className="group flex items-center" aria-label="TruthLens">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-monogram.svg" alt="TruthLens" className="h-9 w-auto transition group-hover:scale-105" />
    </Link>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto scroll-thin pr-0.5">
      {groups.map(({ group, items }) => (
        <div key={group} className="flex flex-col gap-1">
          <div className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{group}</div>
          {items.map(({ href, label, icon: Icon, match }) => {
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
        </div>
      ))}
      <button
        onClick={async () => {
          try { await fetch("/api/auth/login", { method: "DELETE" }); } catch { /* ignore */ }
          onNavigate?.();
          window.location.href = "/login";
        }}
        className="mt-1 flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm text-ink-secondary transition hover:bg-white/[0.04] hover:text-white"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-bg-elev text-ink-secondary">
          <LogOut className="h-4 w-4" />
        </span>
        <span className="truncate">Sign out</span>
      </button>
    </nav>
  );
}

export default function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col gap-4 border-r border-line bg-bg-base px-3 py-4 lg:flex">
        <div className="px-2 py-1">
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
