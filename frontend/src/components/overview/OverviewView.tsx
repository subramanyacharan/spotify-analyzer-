"use client";

import { DATA_FRESHNESS } from "@/lib/copy/terminology";
import { analysisWindowLabel } from "@/lib/data/analysis-window";
import type { OverviewData } from "@/lib/types";
import { ExecutiveSummary } from "./ExecutiveSummary";
import { KpiCards } from "./KpiCards";
import { QuickLinks } from "./QuickLinks";

interface OverviewViewProps {
  data: OverviewData;
}

export function OverviewView({ data }: OverviewViewProps) {
  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Executive overview
        </p>
        <p className="mt-1 text-sm text-zinc-400">
          Top themes and priorities from user reviews · {analysisWindowLabel()}
        </p>
        <p className="mt-1 text-[10px] text-zinc-600">
          {DATA_FRESHNESS(data.dataSource, data.generatedAt)}
        </p>
      </div>

      <KpiCards data={data} />
      <ExecutiveSummary data={data} />
      <QuickLinks data={data} />
    </div>
  );
}
