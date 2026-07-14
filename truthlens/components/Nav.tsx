"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Eye, ScanSearch, Network } from "lucide-react";

/** Top-level navigation: Site Report (existing) + Attribution Tools (new). */
export default function Nav() {
  const pathname = usePathname();
  const isTools = pathname?.startsWith("/tools");

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Link href="/" className="inline-flex items-center gap-2">
        <Eye className="h-6 w-6 text-blue-400" />
        <span className="text-lg font-semibold tracking-tight">TruthLens</span>
      </Link>
      <nav className="flex items-center gap-1 rounded-xl border border-surface-border bg-surface-card/60 p-1 text-sm">
        <Link
          href="/"
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
            !isTools
              ? "bg-blue-600 text-white"
              : "text-slate-300 hover:text-white"
          }`}
        >
          <ScanSearch className="h-4 w-4" />
          Site Report
        </Link>
        <Link
          href="/tools"
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
            isTools ? "bg-blue-600 text-white" : "text-slate-300 hover:text-white"
          }`}
        >
          <Network className="h-4 w-4" />
          Attribution Tools
        </Link>
      </nav>
    </header>
  );
}
