"use client";

import { useMemo, useState } from "react";
import type { InsightsData } from "@/lib/insights/catalog";
import type { InsightFilterGroupId } from "@/lib/insights/catalog";
import { DATA_FRESHNESS } from "@/lib/copy/terminology";
import { insightFilterCtx, scaleCount } from "@/lib/filters/apply";
import { matchesGlobalFilters } from "@/lib/filters/match";
import { useFilters } from "../filters/FilterProvider";
import { FilterEmptyState } from "../ui/FilterEmptyState";
import { ScreenGuide } from "../ui/ScreenGuide";
import { InsightCard } from "./InsightCard";
import { InsightTopicFilters } from "./InsightTopicFilters";

interface InsightsViewProps {
  data: InsightsData;
}

export function InsightsView({ data }: InsightsViewProps) {
  const [topicGroup, setTopicGroup] = useState<InsightFilterGroupId>("all");
  const { appliedFilters } = useFilters();

  const filtered = useMemo(() => {
    return data.topics.filter((topic) => {
      if (topicGroup !== "all" && topic.filterGroup !== topicGroup) return false;
      return matchesGlobalFilters(appliedFilters, insightFilterCtx(topic));
    });
  }, [data.topics, topicGroup, appliedFilters]);

  const reviewsInSelection = useMemo(
    () => scaleCount(data.totalReviews, appliedFilters.dateRange),
    [data.totalReviews, appliedFilters.dateRange]
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Review intelligence
        </p>
        <h2 className="mt-1 text-lg font-semibold text-white">
          What users are telling us
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          {reviewsInSelection.toLocaleString()} reviews in selection · Updated{" "}
          {new Date(data.generatedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
        </p>
      </div>

      <ScreenGuide
        items={[
          {
            label: "Topics",
            text: "Each card answers a product question from grouped review themes (discovery, recommendations, playlists, etc.).",
          },
          {
            label: "Confidence",
            text: "Based on review volume and consistency — low confidence means interpret findings cautiously.",
          },
          {
            label: "Filters",
            text: "Narrow by date, sentiment, or audience using the global filter bar at the top.",
          },
        ]}
      />

      <InsightTopicFilters activeGroup={topicGroup} onGroupChange={setTopicGroup} />

      {filtered.length === 0 ? (
        <FilterEmptyState message="No insights match the selected filters." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((insight) => (
            <InsightCard key={insight.topicId} insight={insight} />
          ))}
        </div>
      )}

      <p className="text-[10px] text-zinc-600">
        {DATA_FRESHNESS(data.dataSource, data.generatedAt)}
      </p>
    </div>
  );
}
