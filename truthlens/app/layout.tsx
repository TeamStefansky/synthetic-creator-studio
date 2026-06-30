import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import Disclaimer from "@/components/Disclaimer";

export const metadata: Metadata = {
  title: "TruthLens — fake-news risk & infrastructure exposure",
  description:
    "Paste a URL to expose the infrastructure behind a site and get a transparent credibility-risk rating. Decision-support tool, not a verdict.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg-base text-gray-200">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <div className="mx-auto max-w-6xl px-4">
          <Disclaimer />
        </div>
      </body>
    </html>
  );
}
