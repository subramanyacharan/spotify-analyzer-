"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { computeConfidence } from "@/lib/confidence";
import { sanitizeRecommendation } from "@/lib/copy/sanitize";
import { DATA_FRESHNESS } from "@/lib/copy/terminology";
import type { PrioritizationData, PrioritizationItem } from "@/lib/opportunities/types";
import { TIER_STYLES } from "@/lib/opportunities/types";
import { prioritizationFilterCtx } from "@/lib/filters/apply";
import { matchesGlobalFilters } from "@/lib/filters/match";
import { useFilters } from "../filters/FilterProvider";
import { ConfidenceBadge } from "../ui/ConfidenceBadge";
import { FilterEmptyState } from "../ui/FilterEmptyState";
import { LowConfidenceDisclaimer } from "../ui/LowConfidenceDisclaimer";

type SortKey = "rank" | "score" | "tier";
type TierTab = "all" | "Critical" | "High" | "Monitor";

export function PrioritizationView({ data }: { data: PrioritizationData }) {
  const { appliedFilters } = useFilters();
  const [tierTab, setTierTab] = useState<TierTab>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [expandedRank, setExpandedRank] = useState<number | null>(null);

  const types = useMemo(() => {
    const set = new Set(data.items.map((i) => i.type));
    return Array.from(set);
  }, [data.items]);

  const filtered = useMemo(() => {
    let list = data.items.filter((item) =>
      matchesGlobalFilters(appliedFilters, prioritizationFilterCtx(item))
    );
    if (tierTab !== "all") list = list.filter((i) => i.tier === tierTab);
    if (typeFilter !== "all") list = list.filter((i) => i.type === typeFilter);

    list.sort((a, b) => {
      if (sortKey === "score") return b.priorityScore - a.priorityScore;
      if (sortKey === "tier") {
        const order = { Critical: 0, High: 1, Monitor: 2 };
        return order[a.tier] - order[b.tier];
      }
      return a.rank - b.rank;
    });
    return list;
  }, [data.items, appliedFilters, tierTab, typeFilter, sortKey]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Prioritized actions
        </p>
        <h2 className="mt-1 text-lg font-semibold text-white">What to do this week</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Unified matrix from pain points, segment friction, and opportunities
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {(["Critical", "High", "Monitor"] as const).map((tier) => (
          <button
            key={tier}
            type="button"
            onClick={() => setTierTab(tierTab === tier ? "all" : tier)}
            className={`rounded-xl border p-3 text-left transition ${
              tierTab === tier
                ? "border-[#1db954] bg-[#1db954]/10"
                : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
            }`}
          >
            <p className="text-2xl font-bold text-white">
              {data.tierSummary[tier] ?? 0}
            </p>
            <p className="text-xs text-zinc-500">{tier}</p>
          </button>
        ))}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <p className="text-2xl font-bold text-[#1db954]">{data.items.length}</p>
          <p className="text-xs text-zinc-500">Total actions</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          Type
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-200"
          >
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {data.items.find((i) => i.type === t)?.typeLabel ?? t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          Sort
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-200"
          >
            <option value="rank">Priority rank</option>
            <option value="score">Priority score</option>
            <option value="tier">Tier</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <FilterEmptyState message="No actions match the selected filters." />
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[10px] uppercase tracking-wider text-zinc-500">
              <th className="p-3 w-12">#</th>
              <th className="p-3">Type</th>
              <th className="p-3">Action</th>
              <th className="p-3 w-24">Score</th>
              <th className="p-3 w-24">Tier</th>
              <th className="p-3 w-28">Confidence</th>
              <th className="p-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <PrioritizationRow
                key={item.rank}
                item={item}
                expanded={expandedRank === item.rank}
                onToggle={() =>
                  setExpandedRank(expandedRank === item.rank ? null : item.rank)
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="sr-only">No actions match the filters.</p>
      )}

      <p className="text-[10px] text-zinc-600">
        {DATA_FRESHNESS(data.dataSource, data.generatedAt)}
      </p>
    </div>
  );
}

function PrioritizationRow({
  item,
  expanded,
  onToggle,
}: {
  item: PrioritizationItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const reviewCount =
    (item.evidence.review_count as number) ??
    (item.evidence.frequency as number) ??
    0;
  const { level, factors } = computeConfidence({
    reviewCount,
    avgClusterSeverity: item.evidence.avg_severity as number | undefined,
    quoteCount: ((item.evidence.quotes as string[]) ?? []).length,
    hasClusterInsight: Boolean(item.evidence.cluster_id ?? item.evidence.cluster_ids),
  });

  return (
    <>
      <tr className="border-b border-zinc-800/80 hover:bg-zinc-900/50">
        <td className="p-3 font-mono text-zinc-500">{item.rank}</td>
        <td className="p-3 text-xs text-zinc-400">{item.typeLabel}</td>
        <td className="p-3 max-w-md">
          <p className="line-clamp-2 text-zinc-200">
            {sanitizeRecommendation(item.title)}
          </p>
        </td>
        <td className="p-3 font-mono text-zinc-300">
          {item.priorityScore.toFixed(3)}
        </td>
        <td className="p-3">
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${TIER_STYLES[item.tier]}`}
          >
            {item.tier}
          </span>
        </td>
        <td className="p-3">
          <ConfidenceBadge level={level} factors={factors} />
          <LowConfidenceDisclaimer level={level} className="mt-1" />
        </td>
        <td className="p-3">
          <button
            type="button"
            onClick={onToggle}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Toggle details"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-zinc-950/50">
          <td colSpan={7} className="p-4">
            <EvidencePanel item={item} />
          </td>
        </tr>
      )}
    </>
  );
}

function EvidencePanel({ item }: { item: PrioritizationItem }) {
  const quotes = (item.evidence.quotes as string[]) ?? [];
  const clusterId = item.evidence.cluster_id as number | undefined;
  const segmentTitle = item.type === "segment_friction" ? item.title.split("—")[0]?.trim() : null;

  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">Recommendation</p>
        <p className="mt-1 text-zinc-300">{sanitizeRecommendation(item.recommendation)}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        {item.type === "opportunity" && clusterId !== undefined && (
          <Link
            href="/opportunities"
            className="inline-flex items-center gap-1 text-xs text-[#1db954] hover:underline"
          >
            View opportunity ranking <ExternalLink className="h-3 w-3" />
          </Link>
        )}
        {segmentTitle && (
          <Link
            href={`/deep-dive?segment=${encodeURIComponent(segmentTitle)}&lens=behavior`}
            className="inline-flex items-center gap-1 text-xs text-[#1db954] hover:underline"
          >
            Segment deep dive <ExternalLink className="h-3 w-3" />
          </Link>
        )}
        {item.type === "pain_point" && (
          <Link
            href="/insights"
            className="inline-flex items-center gap-1 text-xs text-[#1db954] hover:underline"
          >
            Related insights <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      {quotes.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Evidence quotes</p>
          <ul className="mt-1 space-y-1">
            {quotes.map((q) => (
              <li key={q} className="text-xs italic text-zinc-500">
                &ldquo;{q}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="text-xs text-zinc-600">
        <summary className="cursor-pointer text-zinc-500">Raw evidence</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-zinc-900 p-2 text-[10px]">
          {JSON.stringify(item.evidence, null, 2)}
        </pre>
      </details>
    </div>
  );
}
