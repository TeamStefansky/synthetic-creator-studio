"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Eye, FileSearch, Mail, ScrollText } from "lucide-react";

const links = [
  { href: "/", label: "Site Report", icon: FileSearch, match: (p: string) => p === "/" || p.startsWith("/report") },
  { href: "/tools/logs", label: "Log Analyzer", icon: ScrollText, match: (p: string) => p.startsWith("/tools/logs") },
  { href: "/tools/email", label: "Email Tracer", icon: Mail, match: (p: string) => p.startsWith("/tools/email") },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-bg-base/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Eye className="h-5 w-5 text-indigo-400" />
          <span>TruthLens</span>
          <span className="hidden text-xs font-normal text-gray-500 sm:inline">
            · Attribution Tools
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
                  active ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"
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
