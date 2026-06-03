import "./globals.css";
import type { Metadata } from "next";
import { DisclosureBadge } from "./components/DisclosureBadge";

export const metadata: Metadata = {
  title: "Synthetic Creator Studio",
  description: "Transparency-first studio for disclosed AI personas.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold">Synthetic Creator Studio</span>
            <DisclosureBadge />
          </div>
          <nav className="flex gap-4 text-sm text-neutral-600">
            <a href="/" className="hover:text-neutral-900">Dashboard</a>
            <a href="/studio" className="hover:text-neutral-900">Studio</a>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
