"use client";

// Chooses the frame: pre-auth pages (/login, /welcome) render full-bleed with no
// app sidebar or alerts bell; every other route gets the normal Nav + main shell.

import { usePathname } from "next/navigation";
import Nav from "@/components/Nav";
import AlertsBell from "@/components/AlertsBell";
import JobsTray from "@/components/JobsTray";

const BARE = ["/login", "/welcome"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const bare = BARE.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (bare) return <>{children}</>;

  return (
    <>
      <div className="lg:flex lg:items-start">
        <Nav />
        <div className="min-w-0 flex-1">
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </div>
      </div>
      <AlertsBell />
      <JobsTray />
    </>
  );
}
