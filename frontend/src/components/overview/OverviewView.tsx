"use client";

import { useMemo } from "react";
import { useFilters } from "@/components/filters/FilterProvider";
import { DATA_FRESHNESS } from "@/lib/copy/terminology";
import { applyOverviewFilters } from "@/lib/filters/apply";
import { countActiveFilters } from "@/lib/filters/match";
import type { OverviewData } from "@/lib/types";
import { ExecutiveSummary } from "./ExecutiveSummary";
import { KpiCards } from "./KpiCards";
import { QuickLinks } from "./QuickLinks";

interface OverviewViewProps {
  data: OverviewData;
}

export function OverviewView({ data }: OverviewViewProps) {
  const { appliedFilters } = useFilters();

  const filtered = useMemo(
    () => applyOverviewFilters(data, appliedFilters),
    [data, appliedFilters]
  );

  const activeCount = countActiveFilters(appliedFilters);

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Executive overview
        </p>
        <p className="mt-1 text-sm text-zinc-400">
          Discovery and recommendation trends from user reviews
          {activeCount > 0 && (
            <span className="text-zinc-600">
              {" "}
              · {activeCount} filter{activeCount !== 1 ? "s" : ""} applied
            </span>
          )}
        </p>
        <p className="mt-1 text-[10px] text-zinc-600">
          {DATA_FRESHNESS(data.dataSource, data.generatedAt)}
        </p>
      </div>

      <KpiCards data={filtered} />
      <ExecutiveSummary data={filtered} />
      <QuickLinks data={filtered} />
    </div>
  );
}
