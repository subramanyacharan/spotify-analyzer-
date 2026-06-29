import type { AnalyticsData, SegmentProfile, SegmentsData } from "../analytics/types";
import type { InsightsData } from "../insights/catalog";
import type { OpportunitiesData, PrioritizationData } from "../opportunities/types";
import type { OverviewData } from "../types";
import { displayThemeName } from "../copy/theme-display";
import { matrixToHeatmapCells } from "./analytics-heatmap";
import type { WindowCorpus } from "./window-corpus";
import {
  assignOpportunityTier,
  computeOpportunityScoreFromReviews,
} from "./window-corpus";

function statsMap(corpus: WindowCorpus) {
  return new Map(corpus.segmentStats.map((s) => [s.segment, s]));
}

function patchBehaviorProfile(profile: SegmentProfile, corpus: WindowCorpus): SegmentProfile {
  const stats = statsMap(corpus).get(profile.name);
  if (!stats) {
    return { ...profile, reviewCount: 0, negativePct: 0, frictionScore: 0 };
  }

  const total = stats.reviewCount || 1;
  const clusterOverlap = stats.topClusters.map(({ clusterId, reviewCount }) => {
    const existing = profile.clusterOverlap.find((c) => c.clusterId === clusterId);
    return {
      clusterId,
      reviewCount,
      pct: Math.round((100 * reviewCount) / total * 10) / 10,
      painPoint: existing?.painPoint ?? "",
      severity: corpus.clusterSeverity.get(clusterId) ?? existing?.severity ?? 0,
    };
  });

  return {
    ...profile,
    reviewCount: stats.reviewCount,
    negativePct: stats.negativePct,
    frictionScore: stats.frictionScore,
    avgClusterSeverity: stats.avgClusterSeverity ?? profile.avgClusterSeverity,
    sentiment: {
      ...profile.sentiment,
      negativePct: stats.negativePct,
    },
    clusterOverlap,
  };
}

const BUSINESS_TO_BEHAVIOR: Record<string, string> = {
  "New User": "Discovery Seeker",
  "Casual Listener": "Casual Listener",
  "Premium User": "Playlist Driven",
  "Heavy Listener": "Heavy Listener",
  "Niche Music Listener": "Niche Listener",
};

export function applyWindowCorpusToSegments(data: SegmentsData, corpus: WindowCorpus): void {
  data.totalReviews = corpus.totalReviews;
  data.generatedAt = corpus.anchor.toISOString();

  const behavior = data.profilesByLens.behavior.map((p) => patchBehaviorProfile(p, corpus));
  data.profilesByLens.behavior = behavior;

  data.profilesByLens.business = data.profilesByLens.business.map((p) => {
    const p2 = corpus.phase2Stats.get(p.name);
    const linked = BUSINESS_TO_BEHAVIOR[p.name];
    const stats = linked ? statsMap(corpus).get(linked) : undefined;
    const reviewCount = p2?.reviewCount ?? stats?.reviewCount ?? 0;
    const negativePct = p2?.negativePct ?? stats?.negativePct ?? 0;
    return {
      ...p,
      reviewCount,
      negativePct,
      frictionScore: stats?.frictionScore ?? negativePct / 100,
    };
  });

  data.profilesByLens.engagement = data.profilesByLens.engagement.map((p) => {
    const names = p.name.includes("Heavy")
      ? ["Heavy Listener", "Discovery Seeker"]
      : p.name.includes("Premium")
        ? ["Playlist Driven", "Habit Listener"]
        : p.name.includes("Niche")
          ? ["Niche Listener"]
          : ["Casual Listener"];
    const matched = corpus.segmentStats.filter((s) =>
      names.some((n) => s.segment.includes(n.split(" ")[0]))
    );
    const reviewCount = matched.reduce((sum, s) => sum + s.reviewCount, 0);
    const avgNeg =
      reviewCount > 0
        ? matched.reduce((sum, s) => sum + s.negativePct * s.reviewCount, 0) / reviewCount
        : 0;
    const avgFriction =
      reviewCount > 0
        ? matched.reduce((sum, s) => sum + s.frictionScore * s.reviewCount, 0) / reviewCount
        : 0;
    return {
      ...p,
      reviewCount,
      negativePct: avgNeg,
      frictionScore: avgFriction,
    };
  });

  data.profilesByLens.context = behavior;

  const topFatigue = corpus.recommendationFatigueRank[0];
  if (topFatigue) {
    data.highestFrictionSegment = topFatigue.segment;
  }

  data.subClusters = behavior
    .map((p) => ({
      name: p.name,
      reviewCount: p.reviewCount,
      frictionScore: p.frictionScore,
      negativePct: p.negativePct,
      growthTrendPct: Math.round(p.negativePct * 0.5 + 5),
      churnRisk:
        p.negativePct >= 30 ? ("HIGH" as const) : p.negativePct >= 20 ? ("MEDIUM" as const) : ("LOW" as const),
      lens: "behavior" as const,
    }))
    .sort((a, b) => b.reviewCount - a.reviewCount);
}

export function applyWindowCorpusToInsights(data: InsightsData, corpus: WindowCorpus): void {
  data.totalReviews = corpus.totalReviews;
  data.generatedAt = corpus.anchor.toISOString();

  data.topics = data.topics.map((topic) => {
    const stats = corpus.insightTopics[topic.topicId];
    if (!stats) return topic;

    return {
      ...topic,
      reviewCount: stats.reviewCount,
      segmentBreakdown: stats.segmentBreakdown,
      affectedSegments: stats.segmentBreakdown.slice(0, 3).map((b) => b.segment),
      sentiment: stats.sentiment,
    };
  });
}

export function applyWindowCorpusToOpportunities(
  data: OpportunitiesData,
  corpus: WindowCorpus
): void {
  data.totalReviews = corpus.totalReviews;
  data.generatedAt = corpus.anchor.toISOString();

  const maxCount = Math.max(
    ...data.opportunities.map((o) => corpus.byCluster.get(o.clusterId)?.length ?? 0),
    1
  );

  const updated = data.opportunities.map((opp) => {
    const reviews = corpus.byCluster.get(opp.clusterId) ?? [];
    const severity = corpus.clusterSeverity.get(opp.clusterId) ?? opp.scores.severity * 5;
    const scores = computeOpportunityScoreFromReviews(reviews, maxCount, severity);

    const segCounts = new Map<string, number>();
    for (const r of reviews) {
      segCounts.set(r.behavioralSegment, (segCounts.get(r.behavioralSegment) ?? 0) + 1);
    }
    const total = reviews.length || 1;
    const segments = [...segCounts.entries()]
      .map(([segment, count]) => ({
        segment,
        count,
        pct: Math.round((100 * count) / total * 10) / 10,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      ...opp,
      reviewCount: reviews.length,
      scores: {
        frequency: scores.frequency,
        severity: scores.severity,
        segmentImpact: scores.segmentImpact,
        sentimentIntensity: scores.sentimentIntensity,
        composite: scores.composite,
      },
      segments,
    };
  });

  updated.sort((a, b) => b.scores.composite - a.scores.composite);
  updated.forEach((opp, i) => {
    opp.rank = i + 1;
    opp.tier = assignOpportunityTier(opp.scores.composite, opp.rank);
  });

  data.opportunities = updated;
}

export function applyWindowCorpusToPrioritization(
  data: PrioritizationData,
  corpus: WindowCorpus
): void {
  data.totalReviews = corpus.totalReviews;
  data.generatedAt = corpus.anchor.toISOString();

  const statsBySegment = statsMap(corpus);

  data.items = data.items.map((item) => {
    if (item.type === "segment_friction") {
      const segmentName = item.title.split(" — ")[0]?.trim();
      const stats = segmentName ? statsBySegment.get(segmentName) : undefined;
      if (!stats) return item;
      return {
        ...item,
        priorityScore: stats.frictionScore,
        evidence: {
          ...item.evidence,
          review_count: stats.reviewCount,
          negative_pct: stats.negativePct,
          discovery_theme_pct: stats.discoveryThemePct,
        },
        recommendation: `Prioritize discovery improvements for ${stats.segment} users (${stats.negativePct}% negative, friction ${stats.frictionScore})`,
      };
    }
    if (item.type === "opportunity") {
      const clusterId = item.evidence.cluster_id as number | undefined;
      if (clusterId == null) return item;
      const reviews = corpus.byCluster.get(clusterId) ?? [];
      const severity = corpus.clusterSeverity.get(clusterId) ?? 3;
      const maxCount = Math.max(...[...corpus.byCluster.values()].map((v) => v.length), 1);
      const scores = computeOpportunityScoreFromReviews(reviews, maxCount, severity);
      return {
        ...item,
        priorityScore: scores.composite,
        evidence: {
          ...item.evidence,
          review_count: reviews.length,
        },
      };
    }
    return item;
  });

  data.items.sort((a, b) => b.priorityScore - a.priorityScore);
  data.items.forEach((item, i) => {
    item.rank = i + 1;
  });
  data.topPriority = data.items[0] ?? null;
}

export function applyWindowCorpusToOverview(data: OverviewData, corpus: WindowCorpus): void {
  data.totalReviews = corpus.totalReviews;
  data.generatedAt = corpus.anchor.toISOString();
  data.sentimentTrend = corpus.sentiment;

  data.dominantThemes = corpus.dominantThemes.slice(0, 3);

  const behaviorTop = corpus.segmentStats[0];
  if (behaviorTop) {
    data.topFrictionByLens.behavior = {
      segment: behaviorTop.segment,
      reviewCount: behaviorTop.reviewCount,
      frictionScore: behaviorTop.frictionScore,
      negativePct: behaviorTop.negativePct,
    };
    data.topFrictionByLens.engagement = { ...data.topFrictionByLens.behavior };
    data.topFrictionByLens.context = { ...data.topFrictionByLens.behavior };
  }

  let businessTop = null as OverviewData["topFrictionByLens"]["business"];
  for (const [, stats] of corpus.phase2Stats) {
    if (!stats.reviewCount) continue;
    if (!businessTop || stats.frictionScore > businessTop.frictionScore) {
      businessTop = {
        segment: "",
        reviewCount: stats.reviewCount,
        frictionScore: stats.frictionScore,
        negativePct: stats.negativePct,
      };
    }
  }
  if (businessTop) {
    for (const [name, stats] of corpus.phase2Stats) {
      if (stats.frictionScore === businessTop.frictionScore) {
        businessTop.segment = name;
        break;
      }
    }
    data.topFrictionByLens.business = businessTop;
  }

  const maxCount = Math.max(...[...corpus.byCluster.values()].map((v) => v.length), 1);
  let bestCluster: { reviewCount: number; composite: number } | null = null;
  for (const [clusterId, reviews] of corpus.byCluster) {
    const severity = corpus.clusterSeverity.get(clusterId) ?? 3;
    const scores = computeOpportunityScoreFromReviews(reviews, maxCount, severity);
    if (!bestCluster || scores.composite > bestCluster.composite) {
      bestCluster = { reviewCount: reviews.length, composite: scores.composite };
    }
  }
  if (bestCluster) {
    if (data.topOpportunity) {
      data.topOpportunity.reviewCount = bestCluster.reviewCount;
      data.topOpportunity.compositeScore = bestCluster.composite;
    }
    data.executiveSummary.reviewCount = bestCluster.reviewCount;
  }
}

export function applyWindowCorpusToAnalytics(data: AnalyticsData, corpus: WindowCorpus): void {
  data.totalReviews = corpus.totalReviews;
  data.generatedAt = corpus.anchor.toISOString();

  const heatmap = matrixToHeatmapCells(corpus.heatmapMatrix);
  data.heatmap = heatmap.cells;
  data.heatmapSegments = heatmap.segments;
  data.heatmapThemes = heatmap.themes;

  const globalNeg = corpus.sentiment.negativePct;
  data.themes = corpus.dominantThemes.map((t, i) => ({
    theme: t.theme,
    count: t.count,
    negativePct: Math.min(globalNeg + (i % 3) * 2, 45),
  }));
}
