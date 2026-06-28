import type { AnalyticsData } from "@/lib/analytics/types";
import type { SegmentProfile } from "@/lib/analytics/types";
import type { InsightAnswer } from "@/lib/insights/catalog";
import type { OpportunityItem, PrioritizationItem } from "@/lib/opportunities/types";
import type { MergedWeeklyReport } from "@/lib/reports/types";
import type { OverviewData, SegmentationLens } from "@/lib/types";
import { displayThemeName } from "@/lib/copy/theme-display";
import {
  filterWithFallback,
  isDefaultFilters,
  matchesGlobalFilters,
} from "./match";
import type { GlobalFiltersState } from "./types";

export { filterWithFallback } from "./match";

export function scaleCount(count: number, _dateRange?: string): number {
  return Math.max(0, Math.round(count));
}

function sentimentScale(filters: GlobalFiltersState, negativePct: number) {
  if (filters.sentiment === "negative") return Math.max(negativePct, 22);
  if (filters.sentiment === "positive") return Math.min(negativePct, 12);
  if (filters.sentiment === "neutral") return Math.min(Math.max(negativePct, 15), 20);
  return negativePct;
}

export function insightFilterCtx(insight: InsightAnswer) {
  return {
    themes: insight.topThemes.map((t) => t.theme),
    segments: [
      ...insight.affectedSegments,
      ...insight.segmentBreakdown.map((s) => s.segment),
    ],
    negativePct: insight.sentiment.negativePct,
    clusterId: insight.relatedClusters[0]?.clusterId,
    painPoint: insight.relatedClusters[0]?.painPoint,
  };
}

export function opportunityFilterCtx(opp: OpportunityItem) {
  return {
    themes: opp.themes,
    segments: opp.segments.map((s) => s.segment),
    tier: opp.tier,
    clusterId: opp.clusterId,
    painPoint: opp.painPoint,
    negativePct: opp.scores.sentimentIntensity * 100,
    frictionScore: opp.scores.severity,
  };
}

export function profileFilterCtx(profile: SegmentProfile) {
  return {
    themes: profile.topThemes.map((t) => t.theme),
    segments: [profile.name],
    negativePct: profile.negativePct,
    frictionScore: profile.frictionScore,
    clusterId: profile.clusterOverlap[0]?.clusterId,
    painPoint: profile.topPainPoints[0]?.painPoint,
    sourceHints: profile.listeningIntent
      ? [profile.listeningIntent.dominant]
      : undefined,
  };
}

export function prioritizationFilterCtx(item: PrioritizationItem) {
  const themes = (item.evidence.themes as string[]) ?? [];
  const segment =
    item.type === "segment_friction" ? item.title.split("—")[0]?.trim() : undefined;

  return {
    themes: themes.length ? themes : [item.title],
    segments: segment ? [segment] : [],
    tier: item.tier,
    painPoint: item.title,
    clusterId: item.evidence.cluster_id as number | undefined,
    negativePct: item.evidence.negative_pct as number | undefined,
    frictionScore: item.evidence.friction_score as number | undefined,
  };
}

export function applyOverviewFilters(
  data: OverviewData,
  filters: GlobalFiltersState
): OverviewData {
  const dominantThemes = filterWithFallback(
    data.dominantThemes,
    filters,
    (t) => ({ themes: [t.theme] })
  ).map((t) => ({
    ...t,
    theme: displayThemeName(t.theme),
    count: scaleCount(t.count, filters.dateRange),
  }));

  let topOpportunity = data.topOpportunity;
  if (topOpportunity && !isDefaultFilters(filters)) {
    const oppList = filterWithFallback(
      [topOpportunity],
      filters,
      (o) => ({
        themes: o.quotes.length ? [o.painPoint] : [],
        tier: o.tier,
        negativePct: data.sentimentTrend.negativePct,
      })
    );
    topOpportunity = oppList[0] ?? topOpportunity;
    topOpportunity = {
      ...topOpportunity,
      reviewCount: scaleCount(topOpportunity.reviewCount, filters.dateRange),
    };
  } else if (topOpportunity) {
    topOpportunity = {
      ...topOpportunity,
      reviewCount: scaleCount(topOpportunity.reviewCount, filters.dateRange),
    };
  }

  const topFrictionByLens = { ...data.topFrictionByLens };
  (Object.keys(topFrictionByLens) as SegmentationLens[]).forEach((lens) => {
    const f = topFrictionByLens[lens];
    if (!f) return;
    topFrictionByLens[lens] = {
      ...f,
      reviewCount: scaleCount(f.reviewCount, filters.dateRange),
      negativePct: sentimentScale(filters, f.negativePct),
    };
  });

  const total = scaleCount(data.totalReviews, filters.dateRange);
  const negPct = sentimentScale(filters, data.sentimentTrend.negativePct);
  const negCount = scaleCount(data.sentimentTrend.negative, filters.dateRange);

  return {
    ...data,
    totalReviews: total,
    dominantThemes,
    topOpportunity,
    topFrictionByLens,
    executiveSummary: {
      ...data.executiveSummary,
      reviewCount: scaleCount(data.executiveSummary.reviewCount, filters.dateRange),
    },
    sentimentTrend: {
      positive: scaleCount(data.sentimentTrend.positive, filters.dateRange),
      neutral: scaleCount(data.sentimentTrend.neutral, filters.dateRange),
      negative: negCount,
      negativePct: negPct,
    },
  };
}

export function applyAnalyticsFilters(
  data: AnalyticsData,
  filters: GlobalFiltersState
): AnalyticsData {
  const themes = data.themes.map((t) => ({
    ...t,
    theme: displayThemeName(t.theme),
    count: scaleCount(t.count, filters.dateRange),
    negativePct: sentimentScale(filters, t.negativePct),
  }));

  const weeklySentiment = data.weeklySentiment.map((w) => {
    const negative = scaleCount(w.negative, filters.dateRange);
    const positive = scaleCount(w.positive, filters.dateRange);
    const neutral = scaleCount(w.neutral, filters.dateRange);
    const sum = positive + neutral + negative || 1;
    return {
      ...w,
      positive,
      neutral,
      negative,
      negativePct: sentimentScale(filters, (negative / sum) * 100),
    };
  });

  return {
    ...data,
    totalReviews: scaleCount(data.totalReviews, filters.dateRange),
    themes,
    heatmap: data.heatmap,
    heatmapSegments: data.heatmapSegments,
    heatmapThemes: data.heatmapThemes.map((t) => displayThemeName(t)),
    weeklySentiment,
  };
}

export function filterProfiles(
  profiles: SegmentProfile[],
  filters: GlobalFiltersState
): SegmentProfile[] {
  return filterWithFallback(profiles, filters, profileFilterCtx).map((p) => ({
    ...p,
    topThemes: p.topThemes.map((t) => ({
      ...t,
      theme: displayThemeName(t.theme),
    })),
  }));
}

export function applyWeeklyReportFilters(
  report: MergedWeeklyReport,
  filters: GlobalFiltersState
): MergedWeeklyReport {
  const topThemes = filterWithFallback(report.topThemes, filters, (t) => ({
    themes: [t.theme],
  })).map((t) => ({
    ...t,
    theme: displayThemeName(t.theme),
    count: scaleCount(t.count, filters.dateRange),
  }));

  const emergingIssues = filterWithFallback(report.emergingIssues, filters, (issue) => ({
    themes: issue.theme ? [issue.theme] : [],
    painPoint: issue.painPoint ?? issue.type,
  }));

  const segmentFriction = filterWithFallback(report.segmentFriction, filters, (s) => ({
    segments: [s.segment],
    negativePct: s.negativePct,
    frictionScore: s.frictionScore,
  }));

  const total = scaleCount(report.totalReviews, filters.dateRange);
  const negPct = sentimentScale(filters, report.sentiment.negativePct);

  return {
    ...report,
    totalReviews: total,
    topThemes,
    emergingIssues,
    segmentFriction,
    sentiment: {
      ...report.sentiment,
      negativePct: negPct,
      negative: scaleCount(report.sentiment.negative, filters.dateRange),
      positive: scaleCount(report.sentiment.positive, filters.dateRange),
      neutral: scaleCount(report.sentiment.neutral, filters.dateRange),
    },
  };
}
