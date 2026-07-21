import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import Disclaimer from "@/components/Disclaimer";

export const metadata: Metadata = {
  title: "TruthLens - fake-news risk & infrastructure exposure",
  description:
    "Paste a URL to expose the infrastructure behind a site and get a transparent credibility-risk rating. Decision-support tool, not a verdict.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Aurora Dark fonts (runtime-loaded; no build-time font dependency):
            Space Grotesk (display), Inter (body), JetBrains Mono (labels/metrics). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-bg-base font-sans text-ink antialiased">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <div className="mx-auto max-w-6xl px-4">
          <Disclaimer />
        </div>
      </body>
    </html>
  );
}
