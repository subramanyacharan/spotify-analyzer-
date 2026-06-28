"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { computeConfidence } from "@/lib/confidence";
import { sanitizeRecommendation } from "@/lib/copy/sanitize";
import { corpusReviewCaption } from "@/lib/copy/corpus-caption";
import { DATA_FRESHNESS } from "@/lib/copy/terminology";
import type { OpportunitiesData } from "@/lib/opportunities/types";
import { TIER_STYLES } from "@/lib/opportunities/types";
import type { ConfidenceLevel } from "@/lib/types";
import { filterWithFallback, opportunityFilterCtx } from "@/lib/filters/apply";
import { useFilters } from "../filters/FilterProvider";
import { ConfidenceBadge } from "../ui/ConfidenceBadge";
import { FilterEmptyState } from "../ui/FilterEmptyState";
import { LowConfidenceDisclaimer } from "../ui/LowConfidenceDisclaimer";
import { OpportunityScoreChart } from "./OpportunityScoreChart";

type SortKey = "rank" | "score" | "reviews";
type TierFilter = "all" | "Critical" | "High" | "Monitor";
type ConfidenceFilter = "all" | ConfidenceLevel;

export function OpportunityRankingView({ data }: { data: OpportunitiesData }) {
  const { appliedFilters } = useFilters();
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [themeFilter, setThemeFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const allThemes = useMemo(() => {
    const set = new Set<string>();
    data.opportunities.forEach((o) => o.themes.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [data.opportunities]);

  const filtered = useMemo(() => {
    let list = filterWithFallback(
      data.opportunities,
      appliedFilters,
      opportunityFilterCtx
    );

    if (tierFilter !== "all") {
      const tierList = list.filter((o) => o.tier === tierFilter);
      list = tierList.length ? tierList : list;
    }
    if (themeFilter !== "all") {
      const themeList = list.filter((o) => o.themes.includes(themeFilter));
      list = themeList.length ? themeList : list;
    }

    if (confidenceFilter !== "all") {
      list = list.filter((o) => {
        const { level } = computeConfidence({
          reviewCount: o.reviewCount,
          avgClusterSeverity: o.scores.severity * 5,
          quoteCount: o.quotes.length,
          hasClusterInsight: true,
        });
        return level === confidenceFilter;
      });
    }

    list.sort((a, b) => {
      if (sortKey === "score") return b.scores.composite - a.scores.composite;
      if (sortKey === "reviews") return b.reviewCount - a.reviewCount;
      return a.rank - b.rank;
    });

    return list;
  }, [data.opportunities, appliedFilters, tierFilter, themeFilter, confidenceFilter, sortKey]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Product opportunities
        </p>
        <h2 className="mt-1 text-lg font-semibold text-white">Where to invest next</h2>
        <p className="mt-1 text-sm text-zinc-400">
          {data.scoringFormula} · {corpusReviewCaption(data.totalReviews)}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <FilterSelect
          label="Tier"
          value={tierFilter}
          onChange={(v) => setTierFilter(v as TierFilter)}
          options={[
            { value: "all", label: "All tiers" },
            { value: "Critical", label: "Critical" },
            { value: "High", label: "High" },
            { value: "Monitor", label: "Monitor" },
          ]}
        />
        <FilterSelect
          label="Theme"
          value={themeFilter}
          onChange={setThemeFilter}
          options={[
            { value: "all", label: "All themes" },
            ...allThemes.map((t) => ({ value: t, label: t })),
          ]}
        />
        <FilterSelect
          label="Confidence"
          value={confidenceFilter}
          onChange={(v) => setConfidenceFilter(v as ConfidenceFilter)}
          options={[
            { value: "all", label: "All levels" },
            { value: "High", label: "High" },
            { value: "Medium", label: "Medium" },
            { value: "Low", label: "Low" },
          ]}
        />
        <FilterSelect
          label="Sort by"
          value={sortKey}
          onChange={(v) => setSortKey(v as SortKey)}
          options={[
            { value: "rank", label: "Rank" },
            { value: "score", label: "Opportunity score" },
            { value: "reviews", label: "Review volume" },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <FilterEmptyState message="No opportunities match the selected filters." />
      ) : (
        <>
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h3 className="mb-4 text-sm font-semibold text-white">Opportunity score ranking</h3>
            <OpportunityScoreChart opportunities={filtered} />
          </section>

          <div className="space-y-3">
            {filtered.map((opp) => {
              const { level, factors } = computeConfidence({
                reviewCount: opp.reviewCount,
                avgClusterSeverity: opp.scores.severity * 5,
                quoteCount: opp.quotes.length,
                hasClusterInsight: true,
              });
              const expanded = expandedId === opp.id;

              return (
                <article
                  key={opp.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : opp.id)}
                    className="flex w-full items-start gap-4 p-4 text-left transition hover:bg-zinc-900/60"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-sm font-bold text-[#1db954]">
                      {opp.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${TIER_STYLES[opp.tier] ?? TIER_STYLES.Monitor}`}
                        >
                          {opp.tier}
                        </span>
                        <ConfidenceBadge level={level} factors={factors} />
                        <span className="text-[10px] text-zinc-600">
                          Score {(opp.scores.composite * 100).toFixed(1)} ·{" "}
                          {opp.reviewCount.toLocaleString()} reviews
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-zinc-200 line-clamp-2">
                        {sanitizeRecommendation(opp.painPoint)}
                      </p>
                      <LowConfidenceDisclaimer level={level} className="mt-2" />
                      <div className="mt-2 flex flex-wrap gap-1">
                        {opp.themes.map((t) => (
                          <span
                            key={t}
                            className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-500"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    {expanded ? (
                      <ChevronUp className="h-5 w-5 shrink-0 text-zinc-500" />
                    ) : (
                      <ChevronDown className="h-5 w-5 shrink-0 text-zinc-500" />
                    )}
                  </button>

                  {expanded && (
                    <div className="border-t border-zinc-800 bg-zinc-950/40 p-4 space-y-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                          Product opportunity
                        </p>
                        <p className="mt-1 text-sm text-zinc-300">
                          {sanitizeRecommendation(opp.productOpportunity)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                          Feature request
                        </p>
                        <p className="mt-1 text-sm text-zinc-400">
                          {sanitizeRecommendation(opp.featureRequest)}
                        </p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <ScoreBreakdown opp={opp} />
                        <div>
                          <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
                            Affected segments
                          </p>
                          <ul className="space-y-1 text-xs text-zinc-400">
                            {opp.segments.slice(0, 5).map((s) => (
                              <li key={s.segment} className="flex justify-between">
                                <Link
                                  href={`/deep-dive?segment=${encodeURIComponent(s.segment)}&lens=behavior`}
                                  className="text-[#1db954] hover:underline"
                                >
                                  {s.segment}
                                </Link>
                                <span>{s.pct.toFixed(1)}%</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {opp.quotes.length > 0 && (
                        <div>
                          <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
                            User quotes
                          </p>
                          <ul className="space-y-1">
                            {opp.quotes.map((q) => (
                              <li key={q} className="text-xs italic text-zinc-500">
                                &ldquo;{q}&rdquo;
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}

      <p className="text-[10px] text-zinc-600">
        {DATA_FRESHNESS(data.dataSource, data.generatedAt)}
      </p>
    </div>
  );
}

function ScoreBreakdown({
  opp,
}: {
  opp: { scores: OpportunitiesData["opportunities"][0]["scores"] };
}) {
  const rows = [
    { label: "Frequency", value: opp.scores.frequency },
    { label: "Severity", value: opp.scores.severity },
    { label: "Segment impact", value: opp.scores.segmentImpact },
    { label: "Sentiment intensity", value: opp.scores.sentimentIntensity },
  ];

  return (
    <div>
      <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">Score breakdown</p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex justify-between text-xs text-zinc-400">
              <span>{r.label}</span>
              <span>{(r.value * 100).toFixed(1)}%</span>
            </div>
            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-[#1db954]/70"
                style={{ width: `${r.value * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-zinc-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-200"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
