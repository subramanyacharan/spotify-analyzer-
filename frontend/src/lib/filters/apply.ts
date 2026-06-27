import type { AnalyticsData } from "@/lib/analytics/types";
import type { SegmentProfile } from "@/lib/analytics/types";
import type { InsightAnswer } from "@/lib/insights/catalog";
import type { OpportunityItem, PrioritizationItem } from "@/lib/opportunities/types";
import type { MergedWeeklyReport } from "@/lib/reports/types";
import type { OverviewData, SegmentationLens } from "@/lib/types";
import { filterScaleFactor, isDefaultFilters, matchesGlobalFilters } from "./match";
import type { GlobalFiltersState } from "./types";

export function scaleCount(count: number, dateRange: string): number {
  return Math.max(0, Math.round(count * filterScaleFactor(dateRange)));
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
  const strict = !isDefaultFilters(filters);

  let dominantThemes = data.dominantThemes.filter((t) =>
    matchesGlobalFilters(filters, { themes: [t.theme] })
  );
  if (strict && dominantThemes.length === 0) dominantThemes = [];

  const scaledThemes = (dominantThemes.length ? dominantThemes : strict ? [] : data.dominantThemes).map(
    (t) => ({ ...t, count: scaleCount(t.count, filters.dateRange) })
  );

  let topOpportunity = data.topOpportunity;
  if (topOpportunity) {
    const matches = matchesGlobalFilters(filters, {
      themes: [topOpportunity.painPoint],
      tier: topOpportunity.tier,
      negativePct: data.sentimentTrend.negativePct,
    });
    if (!matches && strict) topOpportunity = null;
    else if (topOpportunity) {
      topOpportunity = {
        ...topOpportunity,
        reviewCount: scaleCount(topOpportunity.reviewCount, filters.dateRange),
      };
    }
  }

  const topFrictionByLens = { ...data.topFrictionByLens };
  (Object.keys(topFrictionByLens) as SegmentationLens[]).forEach((lens) => {
    const f = topFrictionByLens[lens];
    if (!f) return;
    const matches = matchesGlobalFilters(filters, {
      segments: [f.segment],
      negativePct: f.negativePct,
      frictionScore: f.frictionScore,
    });
    if (!matches && strict) topFrictionByLens[lens] = null;
    else if (f) {
      topFrictionByLens[lens] = {
        ...f,
        reviewCount: scaleCount(f.reviewCount, filters.dateRange),
        negativePct: sentimentScale(filters, f.negativePct),
      };
    }
  });

  const total = scaleCount(data.totalReviews, filters.dateRange);
  const negPct = sentimentScale(filters, data.sentimentTrend.negativePct);
  const negCount = scaleCount(data.sentimentTrend.negative, filters.dateRange);

  return {
    ...data,
    totalReviews: total,
    dominantThemes: scaledThemes,
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
  const strict = !isDefaultFilters(filters);

  let themes = data.themes
    .filter((t) =>
      matchesGlobalFilters(filters, {
        themes: [t.theme],
        negativePct: t.negativePct,
      })
    )
    .map((t) => ({
      ...t,
      count: scaleCount(t.count, filters.dateRange),
      negativePct: sentimentScale(filters, t.negativePct),
    }));

  if (themes.length === 0 && !strict) {
    themes = data.themes.map((t) => ({
      ...t,
      count: scaleCount(t.count, filters.dateRange),
      negativePct: sentimentScale(filters, t.negativePct),
    }));
  }

  let heatmap = data.heatmap.filter((cell) =>
    matchesGlobalFilters(filters, {
      themes: [cell.theme],
      segments: [cell.segment],
    })
  );
  if (heatmap.length === 0 && !strict) heatmap = data.heatmap;

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

  const themeTotal = themes.reduce((s, t) => s + t.count, 0);

  return {
    ...data,
    totalReviews: scaleCount(data.totalReviews, filters.dateRange),
    themes,
    heatmap,
    heatmapSegments: [...new Set(heatmap.map((c) => c.segment))],
    heatmapThemes: [...new Set(heatmap.map((c) => c.theme))],
    weeklySentiment,
  };
}

export function filterProfiles(
  profiles: SegmentProfile[],
  filters: GlobalFiltersState
): SegmentProfile[] {
  const matched = profiles.filter((p) =>
    matchesGlobalFilters(filters, profileFilterCtx(p))
  );
  if (isDefaultFilters(filters)) return profiles;
  return matched;
}

export function applyWeeklyReportFilters(
  report: MergedWeeklyReport,
  filters: GlobalFiltersState
): MergedWeeklyReport {
  const strict = !isDefaultFilters(filters);

  let topThemes = report.topThemes
    .filter((t) => matchesGlobalFilters(filters, { themes: [t.theme] }))
    .map((t) => ({ ...t, count: scaleCount(t.count, filters.dateRange) }));
  if (topThemes.length === 0 && !strict) {
    topThemes = report.topThemes.map((t) => ({
      ...t,
      count: scaleCount(t.count, filters.dateRange),
    }));
  }

  let emergingIssues = report.emergingIssues.filter((issue) =>
    matchesGlobalFilters(filters, {
      themes: issue.theme ? [issue.theme] : [],
      painPoint: issue.painPoint ?? issue.type,
    })
  );
  if (emergingIssues.length === 0 && !strict) emergingIssues = report.emergingIssues;

  let segmentFriction = report.segmentFriction.filter((s) =>
    matchesGlobalFilters(filters, {
      segments: [s.segment],
      negativePct: s.negativePct,
      frictionScore: s.frictionScore,
    })
  );
  if (segmentFriction.length === 0 && !strict) segmentFriction = report.segmentFriction;

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
