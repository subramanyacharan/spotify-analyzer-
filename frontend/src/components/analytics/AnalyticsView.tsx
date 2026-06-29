"use client";

import type { AnalyticsData } from "@/lib/analytics/types";
import { corpusReviewCaption } from "@/lib/copy/corpus-caption";
import { DATA_FRESHNESS } from "@/lib/copy/terminology";
import { ChartAxisLabels } from "../ui/ChartAxisLabels";
import { SentimentTrendChart } from "./SentimentTrendChart";
import { ThemeDonut, ThemeBarChart } from "./ThemeCharts";
import { ThemeSegmentHeatmap } from "./ThemeSegmentHeatmap";

interface AnalyticsViewProps {
  data: AnalyticsData;
}

export function AnalyticsView({ data }: AnalyticsViewProps) {
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
          {corpusReviewCaption(data.totalReviews, data.generatedAt)} ·{" "}
          {data.weeklySource === "historical_trends"
            ? "Trends from historical_trends"
            : data.weeklySource === "review_sample"
              ? "Weekly trend from review sample"
              : "Corpus snapshot"}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h3 className="mb-4 text-sm font-semibold text-white">Theme volume</h3>
          <ThemeBarChart themes={data.themes} />
        </section>
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h3 className="mb-4 text-sm font-semibold text-white">Theme share</h3>
          <ThemeDonut themes={data.themes} />
        </section>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="mb-1 text-sm font-semibold text-white">Sentiment over time</h3>
        <p className="mb-4 text-xs text-zinc-500">
          Positive, neutral, and negative review mix by week
        </p>
        <SentimentTrendChart data={data.weeklySentiment} />
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="mb-1 text-sm font-semibold text-white">Theme × segment heatmap</h3>
        <p className="mb-4 text-xs text-zinc-500">
          Where discovery friction concentrates across behavioral segments
        </p>
        <ThemeSegmentHeatmap
          cells={data.heatmap}
          segments={data.heatmapSegments}
          themes={data.heatmapThemes}
        />
        <ChartAxisLabels
          xLabel="Behavioral audience segment (column)"
          yLabel="Review theme (row — full taxonomy)"
          note="Each row is a project theme; each column is a behavioral segment. Cell intensity = mention volume for that theme in that segment."
        />
      </section>

      <p className="text-[10px] text-zinc-600">
        {DATA_FRESHNESS(data.dataSource, data.generatedAt)}
      </p>
    </div>
  );
}
