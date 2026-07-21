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
        {/* Inter, loaded at runtime so the build has no font network dependency. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-sans text-gray-200 antialiased">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <div className="mx-auto max-w-6xl px-4">
          <Disclaimer />
        </div>
      </body>
    </html>
  );
}
