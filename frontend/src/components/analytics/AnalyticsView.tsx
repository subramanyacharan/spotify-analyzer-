"use client";

import { useMemo } from "react";
import type { AnalyticsData } from "@/lib/analytics/types";
import { DATA_FRESHNESS } from "@/lib/copy/terminology";
import { applyAnalyticsFilters } from "@/lib/filters/apply";
import { useFilters } from "../filters/FilterProvider";
import { ChartAxisLabels } from "../ui/ChartAxisLabels";
import { SentimentTrendChart } from "./SentimentTrendChart";
import { ThemeDonut, ThemeBarChart } from "./ThemeCharts";
import { ThemeSegmentHeatmap } from "./ThemeSegmentHeatmap";
import { ScreenGuide } from "../ui/ScreenGuide";

interface AnalyticsViewProps {
  data: AnalyticsData;
}

export function AnalyticsView({ data }: AnalyticsViewProps) {
  const { appliedFilters } = useFilters();

  const filtered = useMemo(
    () => applyAnalyticsFilters(data, appliedFilters),
    [data, appliedFilters]
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Theme & sentiment analytics
        </p>
        <h2 className="mt-1 text-lg font-semibold text-white">
          What themes drive friction
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          {filtered.totalReviews.toLocaleString()} reviews ·{" "}
          {filtered.weeklySource === "historical_trends"
            ? "Trends from historical_trends"
            : filtered.weeklySource === "review_sample"
              ? "Weekly trend from review sample"
              : "Corpus snapshot"}
        </p>
      </div>

      <ScreenGuide
        items={[
          {
            label: "Theme charts",
            text: "Which topics appear most in reviews and what share of each theme is negative.",
          },
          {
            label: "Sentiment trend",
            text: "How positive vs negative feedback changes week over week.",
          },
          {
            label: "Heatmap",
            text: "Which audience segments talk about which themes — darker cells mean more mentions.",
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h3 className="mb-4 text-sm font-semibold text-white">Theme volume</h3>
          <ThemeBarChart themes={filtered.themes} />
        </section>
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h3 className="mb-4 text-sm font-semibold text-white">Theme share</h3>
          <ThemeDonut themes={filtered.themes} />
        </section>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="mb-1 text-sm font-semibold text-white">Sentiment over time</h3>
        <p className="mb-4 text-xs text-zinc-500">
          Positive, neutral, and negative review mix by week
        </p>
        <SentimentTrendChart data={filtered.weeklySentiment} />
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="mb-1 text-sm font-semibold text-white">Theme × segment heatmap</h3>
        <p className="mb-4 text-xs text-zinc-500">
          Where discovery friction concentrates across behavioral segments
        </p>
        <ThemeSegmentHeatmap
          cells={filtered.heatmap}
          segments={filtered.heatmapSegments}
          themes={filtered.heatmapThemes}
        />
        <ChartAxisLabels
          xLabel="Behavioral audience segment (column)"
          yLabel="Review theme (row)"
          note="Cell intensity = how often that segment mentions the theme. Use this to spot where friction clusters."
        />
      </section>

      <p className="text-[10px] text-zinc-600">
        {DATA_FRESHNESS(filtered.dataSource, filtered.generatedAt)}
      </p>
    </div>
  );
}
