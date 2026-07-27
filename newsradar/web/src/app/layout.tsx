import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/lib/query-provider";
import { t } from "@/lib/strings.en";

export const metadata: Metadata = {
  title: t.brand,
  description: "Your personalized news front page.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The reader surface is English / LTR. (The dashboard, were it present, would
  // set dir="rtl" in its own route-group layout — set per group, never globally.)
  return (
    <html lang="en" dir="ltr">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
