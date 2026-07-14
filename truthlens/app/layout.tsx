import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TruthLens — Expose the infrastructure behind a website",
  description:
    "Paste a URL to reveal who is behind a site and get a transparent, evidence-based credibility risk rating. A decision-support tool, not a verdict.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
