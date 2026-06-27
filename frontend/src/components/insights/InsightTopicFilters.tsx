"use client";

import type { InsightFilterGroupId } from "@/lib/insights/catalog";
import { INSIGHT_FILTER_GROUPS } from "@/lib/insights/catalog";

interface InsightTopicFiltersProps {
  activeGroup: InsightFilterGroupId;
  onGroupChange: (group: InsightFilterGroupId) => void;
}

export function InsightTopicFilters({
  activeGroup,
  onGroupChange,
}: InsightTopicFiltersProps) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
        Browse by topic
      </p>
      <div className="flex flex-wrap gap-2">
        {INSIGHT_FILTER_GROUPS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onGroupChange(id)}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
              activeGroup === id
                ? "border-[#1db954] bg-[#1db954]/15 text-[#1db954]"
                : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
