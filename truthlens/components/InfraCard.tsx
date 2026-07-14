import type { ReactNode } from "react";

export interface InfraRow {
  label: string;
  value: ReactNode;
}

/**
 * Generic infrastructure card: a titled box with a list of label/value rows.
 * Missing values are rendered as a muted "Unavailable" so the report never
 * looks broken when one upstream source fails.
 */
export default function InfraCard({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: ReactNode;
  rows: InfraRow[];
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-blue-400">{icon}</span>
        <h3 className="font-semibold text-slate-200">{title}</h3>
      </div>
      <dl className="space-y-2">
        {rows.map((row, i) => (
          <div
            key={i}
            className="flex flex-col gap-0.5 border-b border-surface-border/60 pb-2 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
          >
            <dt className="shrink-0 text-xs uppercase tracking-wide text-slate-500">
              {row.label}
            </dt>
            <dd className="break-words text-right text-sm text-slate-200 sm:max-w-[60%]">
              {row.value === null ||
              row.value === undefined ||
              row.value === "" ? (
                <span className="text-slate-600">Unavailable</span>
              ) : (
                row.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Small helper for boolean yes/no rendering with color. */
export function YesNo({ value }: { value: boolean }) {
  return (
    <span className={value ? "text-band-green" : "text-slate-500"}>
      {value ? "Yes" : "No"}
    </span>
  );
}

/** Render a list of chips/tags. */
export function Chips({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-slate-600">None detected</span>;
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {items.map((it) => (
        <span
          key={it}
          className="rounded-md bg-slate-700/40 px-2 py-0.5 font-mono text-xs text-slate-300"
        >
          {it}
        </span>
      ))}
    </div>
  );
}
