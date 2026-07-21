"use client";

import { FileBarChart, Download } from "lucide-react";
import type { Report, OsintDossier } from "@/lib/types";
import { buildRatingReport, reportToMarkdown } from "@/lib/report-export";

function impactStr(n: number) {
  return n > 0 ? `+${n}` : n < 0 ? `${n}` : "0";
}

export default function RatingReportCard({
  report,
  dossier,
}: {
  report: Report;
  dossier?: OsintDossier | null;
}) {
  const rating = buildRatingReport(report);

  const download = () => {
    const md = reportToMarkdown(report, rating, dossier);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `truthlens-${report.domain}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileBarChart className="h-5 w-5 text-indigo-400" />
          <h2 className="text-lg font-semibold">Detailed Rating Report</h2>
        </div>
        <div className="flex gap-2 no-print">
          <button className="btn-ghost text-sm" onClick={download}>
            <Download className="h-4 w-4" /> Download
          </button>
          <button className="btn-ghost text-sm" onClick={() => window.print()}>
            Print / PDF
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Baseline" value={String(rating.baseline)} />
        <Stat label="Risk-increasing" value={`+${rating.increasingTotal}`} accent="text-risk-high" />
        <Stat label="Risk-decreasing" value={String(rating.decreasingTotal)} accent="text-risk-legit" />
      </div>

      <p className="mb-2 text-sm text-gray-300">{rating.bandExplanation}</p>
      <p className="mb-4 text-sm text-gray-400">{rating.confidenceExplanation}</p>

      <div className="space-y-3">
        {rating.groups.map((g) => (
          <div key={g.category} className="rounded-lg border border-white/10 bg-bg-elev p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-100">{g.category}</h3>
              <span
                className={`text-sm font-semibold ${
                  g.subtotal > 0 ? "text-risk-high" : g.subtotal < 0 ? "text-risk-legit" : "text-gray-400"
                }`}
              >
                net {impactStr(g.subtotal)}
              </span>
            </div>
            <ul className="space-y-1.5 text-sm">
              {g.items.map((it, i) => (
                <li key={i} className="flex gap-2">
                  <span
                    className={`w-9 shrink-0 font-mono ${
                      it.impact > 0 ? "text-risk-high" : it.impact < 0 ? "text-risk-legit" : "text-gray-500"
                    }`}
                  >
                    {impactStr(it.impact)}
                  </span>
                  <span className="text-gray-300">
                    <span className="text-gray-100">{it.label}</span> - {it.detail}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card-elev text-center">
      <div className="label-muted">{label}</div>
      <div className={`mt-1 text-xl font-bold ${accent || ""}`}>{value}</div>
    </div>
  );
}
