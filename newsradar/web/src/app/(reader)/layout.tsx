import { SiteHeader } from "@/components/SiteHeader";
import { t } from "@/lib/strings.en";

export default function ReaderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="mx-auto max-w-reader px-4 py-8">{children}</main>
      <footer className="mt-16 border-t border-line py-6 text-center text-xs text-ink-faint">
        <p>{t.a11y.keyboardHint}</p>
      </footer>
    </div>
  );
}
