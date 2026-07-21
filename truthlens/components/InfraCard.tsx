import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import type { Maybe } from "@/lib/types";

interface Row {
  label: string;
  value?: ReactNode;
}

export default function InfraCard({
  title,
  icon,
  data,
  rows,
  note,
}: {
  title: string;
  icon: ReactNode;
  data: Maybe<unknown>;
  rows: Row[];
  note?: string;
}) {
  const unavailable = data.status !== "ok";
  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-brand-soft">{icon}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      {unavailable ? (
        <div className="flex items-center gap-2 text-sm text-ink-secondary">
          <AlertTriangle className="h-4 w-4" /> Unavailable
        </div>
      ) : (
        <dl className="space-y-1.5 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-3">
              <dt className="text-ink-secondary">{r.label}</dt>
              <dd className="max-w-[60%] break-words text-right text-ink">
                {r.value ?? " - "}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {note && <p className="mt-3 text-xs text-yellow-300/80">{note}</p>}
    </div>
  );
}
