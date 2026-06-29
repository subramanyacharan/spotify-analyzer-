"use client";

import { useMemo, useState } from "react";
import type { InsightsData } from "@/lib/insights/catalog";
import type { InsightFilterGroupId } from "@/lib/insights/catalog";
import { DATA_FRESHNESS } from "@/lib/copy/terminology";
import { corpusReviewCaption } from "@/lib/copy/corpus-caption";
import { InsightCard } from "./InsightCard";
import { InsightTopicFilters } from "./InsightTopicFilters";

interface InsightsViewProps {
  data: InsightsData;
}

export function InsightsView({ data }: InsightsViewProps) {
  const [topicGroup, setTopicGroup] = useState<InsightFilterGroupId>("all");

  const filtered = useMemo(() => {
    return data.topics.filter(
      (topic) => topicGroup === "all" || topic.filterGroup === topicGroup
    );
  }, [data.topics, topicGroup]);

  const reviewsInSelection = data.totalReviews;

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
          {corpusReviewCaption(reviewsInSelection, data.generatedAt)} · Updated{" "}
          {new Date(data.generatedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
        </p>
      </div>

      <InsightTopicFilters activeGroup={topicGroup} onGroupChange={setTopicGroup} />

      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-500">No insights in this topic group.</p>
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
