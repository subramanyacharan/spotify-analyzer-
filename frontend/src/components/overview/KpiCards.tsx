"use client";

import { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Star,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { KPI_LABELS, LENS_LABELS } from "@/lib/copy/terminology";
import { displayThemeName } from "@/lib/copy/theme-display";
import { analysisWindowLabel } from "@/lib/data/analysis-window";
import type { OverviewData, SegmentationLens } from "@/lib/types";

interface KpiCardsProps {
  data: OverviewData;
}

export function KpiCards({ data }: KpiCardsProps) {
  const [lens, setLens] = useState<SegmentationLens>("behavior");

  const friction = data.topFrictionByLens[lens];
  const topTheme = data.dominantThemes[0];
  const negativePct = data.sentimentTrend.negativePct;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          icon={Users}
          label={KPI_LABELS.reviews}
          value={data.totalReviews.toLocaleString()}
          sub={analysisWindowLabel()}
        />
        <KpiCard
          icon={TrendingUp}
          label={KPI_LABELS.leadingTheme}
          value={topTheme ? displayThemeName(topTheme.theme) : "—"}
          sub={
            topTheme
              ? `${topTheme.count.toLocaleString()} mentions in corpus`
              : "No theme data available"
          }
        />
        <KpiCard
          icon={negativePct > 20 ? ArrowUpRight : ArrowDownRight}
          label={KPI_LABELS.negativeFeedback}
          value={`${negativePct.toFixed(1)}%`}
          sub={`${data.sentimentTrend.negative.toLocaleString()} negative reviews`}
          accent={negativePct > 20 ? "text-red-400" : "text-[#1db954]"}
        />
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-500">
              <Zap className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">
                {KPI_LABELS.topAudience}
              </span>
            </div>
            <select
              value={lens}
              onChange={(e) => setLens(e.target.value as SegmentationLens)}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-300"
            >
              {(Object.keys(LENS_LABELS) as SegmentationLens[]).map((k) => (
                <option key={k} value={k}>
                  {LENS_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <p className="truncate text-lg font-semibold text-white">
            {friction?.segment ?? "—"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {friction
              ? `${friction.negativePct.toFixed(1)}% negative · score ${friction.frictionScore.toFixed(2)}`
              : "No audience data available"}
          </p>
        </div>
        <KpiCard
          icon={Star}
          label={KPI_LABELS.priorityOpportunity}
          value={
            data.topOpportunity
              ? `#${data.topOpportunity.rank} · ${data.topOpportunity.tier}`
              : "—"
          }
          sub={
            data.topOpportunity
              ? `Impact score ${(data.topOpportunity.compositeScore * 100).toFixed(0)}`
              : "No opportunity data available"
          }
          accent="text-[#1db954]"
        />
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = "text-white",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-2 flex items-center gap-2 text-zinc-500">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`truncate text-lg font-semibold ${accent}`}>{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{sub}</p>
    </div>
  );
}
