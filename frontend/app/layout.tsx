import "./globals.css";
import type { Metadata } from "next";
import { Shell } from "./components/Shell";

export const metadata: Metadata = {
  title: "Synthetic Creator Studio",
  description: "Transparency-first studio for disclosed AI personas.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
