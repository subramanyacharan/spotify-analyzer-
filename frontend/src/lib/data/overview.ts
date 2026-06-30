import type { OverviewData, SegmentationLens, SegmentFriction } from "../types";
import { filterQuotes, sanitizePainPoint, sanitizeRecommendation } from "../copy/sanitize";
import { prepareThemesForDisplay } from "../copy/theme-display";
import { getCorpusMetricsForWindow, resolveCorpusReviewCount } from "./corpus-metrics";
import {
  corpusSourcesFromThemes,
  fetchCanonicalCorpusReviewCount,
  fetchMergedTopThemes,
  resolveDashboardGeneratedAt,
} from "./weekly-insights-merge";
import { loadOverviewFromLocal } from "./local-fallback";

function buildFromSnapshots(
  prioritization: Record<string, unknown>,
  problemStatement: Record<string, unknown> | null,
  opportunities: Record<string, unknown> | null,
  corpusTotal: number
): OverviewData {
  const frictionScores = (prioritization.segment_friction_scores ?? []) as Array<{
    segment: string;
    review_count: number;
    friction_score: number;
    negative_pct: number;
  }>;
  const topPain = (prioritization.top_pain_points ?? []) as Array<{
    pain_point: string;
    frequency: number;
    avg_severity: number;
  }>;

  const behaviorTop = frictionScores.length
    ? [...frictionScores].sort((a, b) => b.friction_score - a.friction_score)[0]
    : null;

  const corpus = getCorpusMetricsForWindow(problemStatement, corpusTotal);
  const sentiment = corpus?.sentiment_breakdown ?? {
    positive: 0,
    neutral: 0,
    negative: 0,
    negative_pct: 0,
  };

  const opps = (opportunities?.opportunities ?? prioritization.opportunity_rankings ?? []) as Array<{
    rank: number;
    tier: string;
    pain_point: string;
    review_count: number;
    scores: { composite: number };
    evidence?: { representative_quotes?: string[] };
  }>;
  const topOpp = opps[0];

  const topPriority = prioritization.top_priority as {
    title?: string;
    tier?: string;
    evidence?: { frequency?: number; avg_severity?: number; quotes?: string[] };
    recommendation?: string;
  };

  const painTop = topPain[0]
    ? {
        segment: sanitizePainPoint(topPain[0].pain_point),
        reviewCount: topPain[0].frequency,
        frictionScore: topPain[0].avg_severity / 5,
        negativePct: 0,
      }
    : null;

  const topFrictionByLens: Record<SegmentationLens, SegmentFriction | null> = {
    business: null,
    engagement: behaviorTop
      ? {
          segment: "Heavy / New User tier",
          reviewCount: behaviorTop.review_count,
          frictionScore: behaviorTop.friction_score,
          negativePct: behaviorTop.negative_pct,
        }
      : null,
    behavior: behaviorTop
      ? {
          segment: behaviorTop.segment,
          reviewCount: behaviorTop.review_count,
          frictionScore: behaviorTop.friction_score,
          negativePct: behaviorTop.negative_pct,
        }
      : null,
    context: behaviorTop
      ? {
          segment: "Multi-source reviews",
          reviewCount: behaviorTop.review_count,
          frictionScore: behaviorTop.friction_score,
          negativePct: behaviorTop.negative_pct,
        }
      : null,
    pain: painTop,
  };

  const matrix = (prioritization.prioritization_matrix ?? []) as Array<{
    evidence?: { quotes?: string[] };
  }>;
  const quotes = filterQuotes(
    topPriority?.evidence?.quotes ??
      matrix.find((m) => m.evidence?.quotes?.length)?.evidence?.quotes ??
      topOpp?.evidence?.representative_quotes ??
      []
  );

  return {
    generatedAt: new Date().toISOString(),
    totalReviews: 0,
    dominantThemes: prepareThemesForDisplay(corpus?.top_themes ?? [], 3),
    sentimentTrend: {
      positive: sentiment.positive,
      neutral: sentiment.neutral,
      negative: sentiment.negative,
      negativePct: sentiment.negative_pct,
    },
    topFrictionByLens,
    topOpportunity: topOpp
      ? {
          rank: topOpp.rank,
          tier: topOpp.tier,
          painPoint: sanitizePainPoint(topOpp.pain_point),
          compositeScore: topOpp.scores.composite,
          reviewCount: topOpp.review_count,
          quotes: filterQuotes(topOpp.evidence?.representative_quotes ?? []),
        }
      : null,
    executiveSummary: {
      text: sanitizeRecommendation(
        (topPriority?.recommendation as string) ??
          (topPriority?.title as string) ??
          "Discovery friction remains the top product priority this period."
      ),
      tier: (topPriority?.tier as string) ?? "Critical",
      quotes: quotes.slice(0, 3),
      reviewCount: topPriority?.evidence?.frequency ?? topOpp?.review_count ?? 0,
      avgSeverity: topPriority?.evidence?.avg_severity,
    },
    dataSource: "supabase",
  };
}

export async function getOverviewData(): Promise<OverviewData> {
  try {
    const merged = await fetchMergedTopThemes();
    const sources = corpusSourcesFromThemes(merged);
    const prioritization = sources.prioritization;

    if (prioritization) {
      const corpusTotal = resolveCorpusReviewCount(sources);
      const overview = buildFromSnapshots(
        prioritization,
        sources.problemStatement ?? null,
        sources.opportunities ?? null,
        corpusTotal
      );
      overview.totalReviews = await fetchCanonicalCorpusReviewCount(sources);
      overview.generatedAt = await resolveDashboardGeneratedAt(sources);
      return overview;
    }
  } catch (e) {
    console.error("[overview] snapshot load failed:", e);
  }

  const local = await loadOverviewFromLocal();
  if (local) return local;

  return {
    generatedAt: new Date().toISOString(),
    totalReviews: 0,
    dominantThemes: [],
    sentimentTrend: { positive: 0, neutral: 0, negative: 0, negativePct: 0 },
    topFrictionByLens: {
      business: null,
      engagement: null,
      behavior: null,
      context: null,
      pain: null,
    },
    topOpportunity: null,
    executiveSummary: {
      text: "No insight data is available yet. Please check back later.",
      tier: "Monitor",
      quotes: [],
      reviewCount: 0,
    },
    dataSource: "local",
  };
}
