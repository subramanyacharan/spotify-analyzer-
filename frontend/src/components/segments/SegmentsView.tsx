"use client";

import { useEffect, useMemo, useState } from "react";
import type { SegmentationLens, SegmentsData } from "@/lib/analytics/types";
import { buildChartMetrics } from "@/lib/analytics/segment-chart-metrics";
import { DATA_FRESHNESS, LENS_DESCRIPTIONS, LENS_LABELS } from "@/lib/copy/terminology";
import { filterProfiles } from "@/lib/filters/apply";
import { matchesGlobalFilters } from "@/lib/filters/match";
import { useFilters } from "../filters/FilterProvider";
import { FilterEmptyState } from "../ui/FilterEmptyState";
import { CohortSelector, type CohortChartView } from "./CohortSelector";
import { SegmentComparisonCards } from "./SegmentComparisonCards";
import { SegmentMatrix } from "./SegmentMatrix";
import { SubClusterTable } from "./SubClusterTable";

interface SegmentsViewProps {
  data: SegmentsData;
}

const LENSES: SegmentationLens[] = [
  "business",
  "engagement",
  "behavior",
  "context",
  "pain",
];

export function SegmentsView({ data }: SegmentsViewProps) {
  const [lens, setLens] = useState<SegmentationLens>("behavior");
  const [chartView, setChartView] = useState<CohortChartView>("compare");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { appliedFilters } = useFilters();

  const profiles = useMemo(
    () => filterProfiles(data.profilesByLens[lens], appliedFilters),
    [data.profilesByLens, lens, appliedFilters]
  );

  const sorted = useMemo(
    () => [...profiles].sort((a, b) => b.frictionScore - a.frictionScore),
    [profiles]
  );

  useEffect(() => {
    const topTwo = sorted.slice(0, 2).map((p) => p.id);
    setSelectedIds(topTwo);
  }, [lens, sorted]);

  const selectedProfiles = useMemo(
    () =>
      sorted.filter((p) => selectedIds.includes(p.id)).length
        ? sorted.filter((p) => selectedIds.includes(p.id))
        : sorted.slice(0, 2),
    [sorted, selectedIds]
  );

  const chartProfiles = chartView === "all" ? sorted : selectedProfiles;

  const chartMetrics = useMemo(
    () => buildChartMetrics(sorted, data.matrixMetrics, lens),
    [sorted, data.matrixMetrics, lens]
  );

  const segmentA = selectedProfiles[0] ?? sorted[0];
  const segmentB = selectedProfiles[1] ?? sorted[1] ?? sorted[0];

  const frictionDeltaPct =
    segmentA && segmentB && segmentB.frictionScore > 0
      ? Math.round(
          ((segmentA.frictionScore - segmentB.frictionScore) / segmentB.frictionScore) * 100
        )
      : data.varianceDeltaPct;

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Segment explorer
        </p>
        <h2 className="mt-1 text-lg font-semibold text-white">Compare audience cohorts</h2>
        <p className="mt-1 text-sm text-zinc-400">
          {data.totalReviews.toLocaleString()} reviews · Highest friction:{" "}
          <span className="text-[#1db954]">{data.highestFrictionSegment}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {LENSES.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLens(l)}
            title={LENS_DESCRIPTIONS[l]}
            className={`rounded-lg border px-3 py-1.5 text-xs transition ${
              lens === l
                ? "border-[#1db954] bg-[#1db954]/15 text-[#1db954]"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            {LENS_LABELS[l]}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <FilterEmptyState message="No segments match the selected global filters." />
      ) : (
        <>
          <CohortSelector
            profiles={sorted}
            chartView={chartView}
            onChartViewChange={setChartView}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
          />

          <div className="grid gap-4 lg:grid-cols-3">
            <SegmentMatrix
              metrics={chartMetrics}
              cohorts={chartProfiles}
              viewMode={chartView}
            />
            {segmentA && segmentB && (
              <SegmentComparisonCards
                segmentA={segmentA}
                segmentB={segmentB}
                varianceDeltaPct={frictionDeltaPct}
              />
            )}
          </div>

          <SubClusterTable
            subClusters={
              lens === "behavior"
                ? data.subClusters.filter((row) =>
                    matchesGlobalFilters(appliedFilters, {
                      segments: [row.name],
                      negativePct: row.negativePct,
                      frictionScore: row.frictionScore,
                    })
                  )
                : sorted.map((p) => ({
                    name: p.name,
                    reviewCount: p.reviewCount,
                    frictionScore: p.frictionScore,
                    negativePct: p.negativePct,
                    growthTrendPct: Math.round(p.negativePct * 0.4 + 8),
                    churnRisk:
                      p.negativePct >= 30
                        ? ("HIGH" as const)
                        : p.negativePct >= 20
                          ? ("MEDIUM" as const)
                          : ("LOW" as const),
                    lens,
                  }))
            }
            lens={lens}
          />
        </>
      )}

      <p className="text-[10px] text-zinc-600">
        {DATA_FRESHNESS(data.dataSource, data.generatedAt)}
      </p>
    </div>
  );
}
