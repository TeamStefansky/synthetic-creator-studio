import clsx from "clsx";
import type { ReactNode } from "react";
import { DisclosureStatus } from "../lib/api";

export function StatusChip({ status }: { status: DisclosureStatus | string }) {
  const map: Record<string, string> = {
    tagged: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    blocked: "bg-rose-100 text-rose-700",
    published: "bg-emerald-100 text-emerald-700",
    approved: "bg-brand-100 text-brand-700",
    draft: "bg-slate-100 text-slate-600",
    failed: "bg-rose-100 text-rose-700",
    rejected: "bg-rose-100 text-rose-700",
  };
  return <span className={clsx("chip capitalize", map[status] ?? "bg-slate-100 text-slate-600")}>{status}</span>;
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/50 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-slate-400">{icon}</div>}
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

export function Alert({ kind, children }: { kind: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-rose-200 bg-rose-50 text-rose-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    info: "border-brand-200 bg-brand-50 text-brand-700",
  }[kind];
  return <div className={clsx("animate-fade-in rounded-xl border px-4 py-3 text-sm", styles)}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
