import Link from "next/link";
import { t } from "@/lib/strings.en";

type Props = {
  count: number;
  href?: string;
};

/** "{n} sources" chip for event-backed stories, linking to the coverage list. */
export function CoverageChip({ count, href }: Props) {
  if (!count || count < 2) return null;
  const label = t.frontPage.coverageChip(count);
  const cls =
    "inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-xs font-medium text-paper";
  if (href) {
    return (
      <Link href={href} className={cls}>
        {label}
      </Link>
    );
  }
  return <span className={cls}>{label}</span>;
}
