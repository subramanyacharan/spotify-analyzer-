import type { OverviewData, SegmentationLens, SegmentFriction } from "../types";
import { prepareThemesForDisplay } from "../copy/theme-display";
import { getCorpusMetrics } from "./corpus-metrics";
import { readLocalOutputJson } from "./read-local-json";

function topBehaviorFriction(
  scores: Array<{
    segment: string;
    review_count: number;
    friction_score: number;
    negative_pct: number;
  }>
): SegmentFriction | null {
  if (!scores.length) return null;
  const top = [...scores].sort((a, b) => b.friction_score - a.friction_score)[0];
  return {
    segment: top.segment,
    reviewCount: top.review_count,
    frictionScore: top.friction_score,
    negativePct: top.negative_pct,
  };
}

function painLensFriction(
  painPoints: Array<{ pain_point: string; frequency: number; avg_severity: number }>
): SegmentFriction | null {
  if (!painPoints.length) return null;
  const top = painPoints[0];
  return {
    segment: top.pain_point.slice(0, 48) + (top.pain_point.length > 48 ? "…" : ""),
    reviewCount: top.frequency,
    frictionScore: top.avg_severity / 5,
    negativePct: 0,
  };
}

export async function loadOverviewFromLocal(): Promise<OverviewData | null> {
  const [prioritization, problemStatement, opportunities] = await Promise.all([
    readLocalOutputJson<Record<string, unknown>>("insight_prioritization.json"),
    readLocalOutputJson<Record<string, unknown>>("problem_statement_insights.json"),
    readLocalOutputJson<Record<string, unknown>>("opportunity_scores.json"),
  ]);

  if (!prioritization || !problemStatement) return null;

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
  const behaviorTop = topBehaviorFriction(frictionScores);

  const corpus = getCorpusMetrics(problemStatement);
  const sentiment = corpus?.sentiment_breakdown ?? {
    positive: 0,
    neutral: 0,
    negative: 0,
    negative_pct: 0,
  };

  const themes = prepareThemesForDisplay(
    corpus?.top_themes ??
      ((prioritization.opportunity_rankings as Array<{ themes?: string[] }>)?.[0]
        ?.themes?.map((t) => ({ theme: t, count: 0 })) ??
        []),
    3
  );
  const topPriority = prioritization.top_priority as {
    title?: string;
    tier?: string;
    evidence?: { frequency?: number; avg_severity?: number; quotes?: string[] };
    recommendation?: string;
  };

  const opps = (opportunities?.opportunities ?? []) as Array<{
    rank: number;
    tier: string;
    pain_point: string;
    review_count: number;
    scores: { composite: number };
    evidence?: { representative_quotes?: string[] };
  }>;
  const topOpp = opps[0];

  const topFrictionByLens: Record<SegmentationLens, SegmentFriction | null> = {
    business: behaviorTop
      ? { ...behaviorTop, segment: "Premium User (proxy)" }
      : null,
    engagement: behaviorTop
      ? { ...behaviorTop, segment: "Heavy / New User tier" }
      : null,
    behavior: behaviorTop,
    context: behaviorTop ? { ...behaviorTop, segment: "Play Store + App Store" } : null,
    pain: painLensFriction(topPain),
  };

  const matrix = (prioritization.prioritization_matrix ?? []) as Array<{
    evidence?: { quotes?: string[] };
  }>;
  const quotes =
    topPriority?.evidence?.quotes ??
    matrix.find((m) => m.evidence?.quotes?.length)?.evidence?.quotes ??
    topOpp?.evidence?.representative_quotes ??
    [];

  return {
    generatedAt:
      (prioritization.generated_at as string) ??
      (problemStatement.generated_at as string) ??
      new Date().toISOString(),
    totalReviews:
      (corpus?.review_count as number) ??
      (prioritization.total_reviews_analyzed as number) ??
      (problemStatement.total_reviews_analyzed as number) ??
      0,
    dominantThemes: themes,
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
          painPoint: topOpp.pain_point,
          compositeScore: topOpp.scores.composite,
          reviewCount: topOpp.review_count,
          quotes: topOpp.evidence?.representative_quotes ?? [],
        }
      : null,
    executiveSummary: {
      text:
        (topPriority?.recommendation as string) ??
        (topPriority?.title as string) ??
        "Discovery friction remains the top product priority this week.",
      tier: (topPriority?.tier as string) ?? "Critical",
      quotes: quotes.slice(0, 3),
      reviewCount: topPriority?.evidence?.frequency ?? topOpp?.review_count ?? 0,
      avgSeverity: topPriority?.evidence?.avg_severity,
    },
    dataSource: "local",
  };
}
