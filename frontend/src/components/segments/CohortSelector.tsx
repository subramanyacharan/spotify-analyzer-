"use client";

import type { SegmentProfile } from "@/lib/analytics/types";
import type { CohortChartView } from "@/lib/analytics/segment-chart-metrics";

export type { CohortChartView };

interface CohortSelectorProps {
  profiles: SegmentProfile[];
  chartView: CohortChartView;
  onChartViewChange: (view: CohortChartView) => void;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
}

export function CohortSelector({
  profiles,
  chartView,
  onChartViewChange,
  selectedIds,
  onSelectedIdsChange,
}: CohortSelectorProps) {
  const toggleCohort = (id: string) => {
    if (chartView === "all") return;
    if (selectedIds.includes(id)) {
      if (selectedIds.length > 1) {
        onSelectedIdsChange(selectedIds.filter((x) => x !== id));
      }
      return;
    }
    if (selectedIds.length >= 4) return;
    onSelectedIdsChange([...selectedIds, id]);
  };

  return (
    <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Cohort comparison</h3>
          <p className="text-xs text-zinc-500">
            Choose cohorts to compare, or view all at once
          </p>
        </div>
        <div className="flex rounded-lg border border-zinc-700 p-0.5">
          <button
            type="button"
            onClick={() => onChartViewChange("compare")}
            className={`rounded-md px-3 py-1.5 text-xs transition ${
              chartView === "compare"
                ? "bg-[#1db954]/20 text-[#1db954]"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Compare selected
          </button>
          <button
            type="button"
            onClick={() => onChartViewChange("all")}
            className={`rounded-md px-3 py-1.5 text-xs transition ${
              chartView === "all"
                ? "bg-[#1db954]/20 text-[#1db954]"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            All cohorts
          </button>
        </div>
      </div>

      {chartView === "compare" ? (
        <div className="flex flex-wrap gap-2">
          {profiles.map((p) => {
            const selected = selectedIds.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleCohort(p.id)}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                  selected
                    ? "border-[#1db954] bg-[#1db954]/10 text-[#1db954]"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                <span className="font-medium">{p.name}</span>
                <span className="mt-0.5 block text-[10px] text-zinc-500">
                  {p.reviewCount.toLocaleString()} reviews · friction{" "}
                  {p.frictionScore.toFixed(2)}
                </span>
              </button>
            );
          })}
          <p className="w-full text-[10px] text-zinc-600">
            Select up to 4 cohorts. Click again to remove.
          </p>
        </div>
      ) : (
        <p className="text-xs text-zinc-400">
          Showing all {profiles.length} cohorts in the current lens, ranked by friction.
        </p>
      )}
    </div>
  );
}
