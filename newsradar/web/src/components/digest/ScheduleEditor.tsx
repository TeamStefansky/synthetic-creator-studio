"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { InterestOut, Page, ReportScheduleOut } from "@/lib/api/types";
import { t } from "@/lib/strings.en";

/**
 * Digest schedule editor. Note: the backend's ReportScheduleIn requires a
 * watchlist_id even for a headline_digest (which spans all interests and anchors
 * to the first), so we attach the first interest's id.
 */
export function ScheduleEditor() {
  const qc = useQueryClient();
  const [hour, setHour] = useState(7);
  const [timezone, setTimezone] = useState("Asia/Jerusalem");
  const [recipients, setRecipients] = useState("");
  const [lookback, setLookback] = useState(24);
  const [active, setActive] = useState(true);

  const interests = useQuery({
    queryKey: ["interests"],
    queryFn: () =>
      apiFetch<Page<InterestOut>>("/interests", { query: { limit: 1, offset: 0 } }),
  });
  const schedules = useQuery({
    queryKey: ["report-schedules"],
    queryFn: () =>
      apiFetch<Page<ReportScheduleOut>>("/report-schedules", {
        query: { limit: 50, offset: 0 },
      }),
  });

  const anchor = interests.data?.items?.[0]?.id ?? null;

  const create = useMutation({
    mutationFn: () =>
      apiFetch<ReportScheduleOut>("/report-schedules", {
        method: "POST",
        body: {
          watchlist_id: anchor,
          name: `Headline digest ${hour}:00 ${timezone}`,
          cron: `0 ${hour} * * *`,
          timezone,
          report_type: "headline_digest",
          lookback_hours: lookback,
          recipients: {
            emails: recipients
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          },
          active,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report-schedules"] }),
  });

  const digestSchedules =
    schedules.data?.items?.filter((s) => s.report_type === "headline_digest") ?? [];

  return (
    <div className="rounded-lg border border-line bg-paper p-5">
      <h3 className="font-headline text-lg text-ink">{t.digest.scheduleHeading}</h3>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium text-ink">{t.digest.scheduleHour}</span>
          <input
            type="number"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            className="mt-1 w-full rounded border border-line bg-wash px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-ink">{t.digest.scheduleTimezone}</span>
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="mt-1 w-full rounded border border-line bg-wash px-3 py-2"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="font-medium text-ink">{t.digest.scheduleRecipients}</span>
          <input
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder="you@example.com, team@example.com"
            className="mt-1 w-full rounded border border-line bg-wash px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-ink">{t.digest.scheduleLookback}</span>
          <input
            type="number"
            min={1}
            max={720}
            value={lookback}
            onChange={(e) => setLookback(Number(e.target.value))}
            className="mt-1 w-full rounded border border-line bg-wash px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span className="font-medium text-ink">{t.digest.scheduleActive}</span>
        </label>
      </div>

      <button
        type="button"
        onClick={() => create.mutate()}
        disabled={!anchor || create.isPending}
        className="mt-4 rounded bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-accent disabled:opacity-50"
        title={anchor ? undefined : "Create an interest first"}
      >
        {t.digest.scheduleSave}
      </button>
      {!anchor ? (
        <p className="mt-2 text-xs text-ink-faint">Create an interest first to schedule a digest.</p>
      ) : null}
      {create.isError ? (
        <p className="mt-2 text-sm text-accent">{(create.error as Error).message}</p>
      ) : null}

      {digestSchedules.length ? (
        <ul className="mt-4 space-y-1 text-sm text-ink-muted">
          {digestSchedules.map((s) => (
            <li key={s.id}>
              {s.name} — <code className="text-xs">{s.cron}</code> {s.timezone}{" "}
              {s.active ? "" : "(inactive)"}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
