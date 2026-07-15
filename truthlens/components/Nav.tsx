"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Eye, FileSearch, Mail, ScrollText, Activity, Info, ShieldQuestion, Radar } from "lucide-react";

const links = [
  { href: "/", label: "Site Report", icon: FileSearch, match: (p: string) => p === "/" || p.startsWith("/report") },
  { href: "/tools/post", label: "Post Check", icon: ShieldQuestion, match: (p: string) => p.startsWith("/tools/post") },
  { href: "/platform", label: "Brand Watch", icon: Radar, match: (p: string) => p.startsWith("/platform") },
  { href: "/tools/logs", label: "Log Analyzer", icon: ScrollText, match: (p: string) => p.startsWith("/tools/logs") },
  { href: "/tools/email", label: "Email Tracer", icon: Mail, match: (p: string) => p.startsWith("/tools/email") },
  { href: "/monitor", label: "Monitor", icon: Activity, match: (p: string) => p.startsWith("/monitor") },
  { href: "/about", label: "About", icon: Info, match: (p: string) => p.startsWith("/about") },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-bg-base/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="group flex items-center gap-2.5 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-glow transition group-hover:scale-105">
            <Eye className="h-5 w-5 text-white" />
          </span>
          <span className="text-[15px] tracking-tight">
            Truth<span className="text-brand-soft">Lens</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {links.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition sm:px-3 ${
                  active
                    ? "bg-white/[0.08] text-white ring-hairline"
                    : "text-gray-400 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
