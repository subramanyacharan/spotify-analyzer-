"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import { mergeWeekRange } from "@/lib/reports/merge-weeks";
import type { WeeklyReportsCatalog } from "@/lib/reports/types";
import { LENS_LABELS } from "@/lib/analytics/types";
import { applyWeeklyReportFilters } from "@/lib/filters/apply";
import { useFilters } from "../filters/FilterProvider";
import { ConfidenceBadge } from "../ui/ConfidenceBadge";
import { LowConfidenceDisclaimer } from "../ui/LowConfidenceDisclaimer";
import { ScreenGuide } from "../ui/ScreenGuide";
import { WeekRangeFilter } from "./WeekRangeFilter";
import { WeeklyTrendChart } from "./WeeklyTrendChart";

export function WeeklyReportsView({ catalog }: { catalog: WeeklyReportsCatalog }) {
  const { appliedFilters } = useFilters();
  const totalWeeks = catalog.totalWeeks;
  const [fromWeek, setFromWeek] = useState(1);
  const [toWeek, setToWeek] = useState(Math.min(4, totalWeeks));

  const report = useMemo(() => {
    const merged = mergeWeekRange(catalog.weeks, fromWeek, toWeek);
    return applyWeeklyReportFilters(merged, appliedFilters);
  }, [catalog.weeks, fromWeek, toWeek, appliedFilters]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Weekly intelligence
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">Reports & emerging issues</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {totalWeeks} weeks available · Source: {catalog.dataSource}
          </p>
        </div>
        <ConfidenceBadge
          level={report.confidenceLevel}
          factors={report.confidenceFactors}
        />
      </div>

      <LowConfidenceDisclaimer level={report.confidenceLevel} />

      <ScreenGuide
        items={[
          {
            label: "Week range",
            text: "Select which weeks to include — metrics and trends update for that window.",
          },
          {
            label: "Emerging issues",
            text: "Themes or pain points growing faster than the prior week.",
          },
          {
            label: "Segment friction",
            text: "Which audience groups show the highest negative feedback in the selected range.",
          },
        ]}
      />

      <WeekRangeFilter
        totalWeeks={totalWeeks}
        fromWeek={fromWeek}
        toWeek={toWeek}
        onFromChange={setFromWeek}
        onToChange={setToWeek}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Reviews in range" value={report.totalReviews.toLocaleString()} />
        <Kpi
          label="Negative sentiment"
          value={`${report.sentiment.negativePct.toFixed(1)}%`}
          accent={
            report.sentimentDelta.changePp > 0 ? "text-red-400" : "text-[#1db954]"
          }
        />
        <Kpi
          label="Sentiment change"
          value={`${report.sentimentDelta.changePp >= 0 ? "+" : ""}${report.sentimentDelta.changePp.toFixed(1)} pp`}
        />
        <Kpi
          label="Emerging alerts"
          value={String(report.emergingIssues.length)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h3 className="mb-1 text-sm font-semibold text-white">Sentiment by week</h3>
          <p className="mb-4 text-xs text-zinc-500">Negative % across selected range</p>
          <WeeklyTrendChart report={report} />
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Theme shifts</h3>
          <p className="mb-3 text-xs text-zinc-500">
            Week {fromWeek} → Week {toWeek} comparison
          </p>
          <ul className="space-y-2">
            {report.themeShifts.slice(0, 5).map((t) => (
              <li key={t.theme} className="flex items-center justify-between text-sm">
                <span className="truncate text-zinc-300">{t.theme}</span>
                <span
                  className={`flex items-center gap-1 text-xs ${
                    t.changePct >= 0 ? "text-red-400" : "text-[#1db954]"
                  }`}
                >
                  {t.changePct >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {t.changePct >= 0 ? "+" : ""}
                  {t.changePct.toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          Emerging pain points
        </h3>
        {report.emergingIssues.length === 0 ? (
          <p className="text-sm text-zinc-500">No spikes detected in the selected week range.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {report.emergingIssues.slice(0, 6).map((issue, i) => (
              <div
                key={`${issue.theme ?? issue.type}-${i}`}
                className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3"
              >
                <p className="text-sm font-medium text-zinc-200">
                  {issue.theme ?? issue.painPoint ?? issue.type}
                </p>
                <p className="mt-1 text-xs text-amber-400">+{issue.changePct}% spike</p>
                {issue.previousCount !== undefined && (
                  <p className="mt-1 text-[10px] text-zinc-600">
                    {issue.previousCount} → {issue.currentCount} mentions
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">
          Segment friction (behavioral lens)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[10px] uppercase text-zinc-500">
                <th className="pb-2">Segment</th>
                <th className="pb-2">Reviews</th>
                <th className="pb-2">Friction</th>
                <th className="pb-2">Negative %</th>
              </tr>
            </thead>
            <tbody>
              {report.segmentFriction.slice(0, 6).map((s) => (
                <tr key={s.segment} className="border-b border-zinc-800/60">
                  <td className="py-2 text-zinc-300">{s.segment}</td>
                  <td className="py-2 text-zinc-500">{s.reviewCount.toLocaleString()}</td>
                  <td className="py-2 text-zinc-400">{s.frictionScore.toFixed(3)}</td>
                  <td className="py-2 text-zinc-400">{s.negativePct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-zinc-600">
          Also available: {Object.values(LENS_LABELS).join(" · ")} — aggregated for weeks{" "}
          {fromWeek}–{toWeek}
        </p>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Top themes (aggregated)</h3>
        <ul className="space-y-2">
          {report.topThemes.map((t) => (
            <li key={t.theme} className="flex justify-between text-sm">
              <span className="text-zinc-300">{t.theme}</span>
              <span className="text-zinc-500">{t.count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Report archive</h3>
        <div className="space-y-3">
          {report.snapshotsInRange.map((w) => (
            <details
              key={w.weekStart}
              className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3"
            >
              <summary className="cursor-pointer text-sm font-medium text-zinc-200">
                {w.label} — {w.reviewCount.toLocaleString()} reviews ·{" "}
                {w.sentiment.negativePct.toFixed(1)}% negative
              </summary>
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-zinc-500">
                {w.pulseReportMd || "No markdown report stored for this week."}
              </pre>
            </details>
          ))}
        </div>
      </section>

      {Object.keys(report.tierSummary).length > 0 && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">
            Prioritization highlights (aggregated)
          </h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(report.tierSummary).map(([tier, count]) => (
              <div
                key={tier}
                className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-2"
              >
                <p className="text-lg font-bold text-white">{count}</p>
                <p className="text-xs text-zinc-500">{tier} actions</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  accent = "text-white",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${accent}`}>{value}</p>
    </div>
  );
}
