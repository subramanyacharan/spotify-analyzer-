import type { OverviewData, SegmentationLens, SegmentFriction } from "../types";
import { filterQuotes, sanitizePainPoint, sanitizeRecommendation } from "../copy/sanitize";
import { getSupabaseServerClient } from "../supabase/server";
import {
  fetchMergedTopThemes,
  fetchProcessedReviewCount,
} from "./weekly-insights-merge";
import { loadOverviewFromLocal } from "./local-fallback";

const BUSINESS_SEGMENTS = [
  "New User",
  "Casual Listener",
  "Premium User",
  "Heavy Listener",
  "Niche Music Listener",
];

async function fetchBusinessFriction(): Promise<SegmentFriction | null> {
  const client = getSupabaseServerClient();
  if (!client) return null;

  const results: SegmentFriction[] = [];

  for (const segment of BUSINESS_SEGMENTS) {
    const { count: total } = await client
      .from("processed_reviews")
      .select("*", { count: "exact", head: true })
      .eq("user_segment", segment);

    const { count: negative } = await client
      .from("processed_reviews")
      .select("*", { count: "exact", head: true })
      .eq("user_segment", segment)
      .eq("sentiment_label", "negative");

    if (!total || total === 0) continue;
    const negativePct = ((negative ?? 0) / total) * 100;
    results.push({
      segment,
      reviewCount: total,
      frictionScore: negativePct / 100,
      negativePct,
    });
  }

  if (!results.length) return null;
  return [...results].sort((a, b) => b.frictionScore - a.frictionScore)[0];
}

function parseWeeklySnapshot(topThemes: unknown): {
  prioritization: Record<string, unknown> | null;
  problemStatement: Record<string, unknown> | null;
  opportunities: Record<string, unknown> | null;
} {
  if (!topThemes || typeof topThemes !== "object") {
    return { prioritization: null, problemStatement: null, opportunities: null };
  }
  const t = topThemes as Record<string, unknown>;
  return {
    prioritization: (t.insight_prioritization as Record<string, unknown>) ?? null,
    problemStatement:
      (t.problem_statement_insights as Record<string, unknown>) ?? null,
    opportunities: (t.opportunity_scores as Record<string, unknown>) ?? null,
  };
}

function buildFromSnapshots(
  prioritization: Record<string, unknown>,
  problemStatement: Record<string, unknown> | null,
  opportunities: Record<string, unknown> | null
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

  const answers = (problemStatement?.answers ?? []) as Array<{
    supporting_metrics?: {
      sentiment_breakdown?: {
        positive: number;
        neutral: number;
        negative: number;
        negative_pct: number;
      };
      top_themes?: Array<{ theme: string; count: number }>;
    };
  }>;
  const discovery = answers[0]?.supporting_metrics;
  const sentiment = discovery?.sentiment_breakdown ?? {
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
        segment:
          sanitizePainPoint(topPain[0].pain_point).slice(0, 48) +
          (topPain[0].pain_point.length > 48 ? "…" : ""),
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
    generatedAt:
      (prioritization.generated_at as string) ?? new Date().toISOString(),
    totalReviews: (prioritization.total_reviews_analyzed as number) ?? 0,
    dominantThemes: discovery?.top_themes?.slice(0, 3) ?? [],
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
  const client = getSupabaseServerClient();

  if (client) {
    try {
      const merged = await fetchMergedTopThemes();
      const { prioritization, problemStatement, opportunities } =
        parseWeeklySnapshot(merged);
      if (prioritization) {
        const overview = buildFromSnapshots(
          prioritization,
          problemStatement,
          opportunities
        );
        if (!overview.totalReviews) {
          overview.totalReviews = await fetchProcessedReviewCount();
        }
        const businessTop = await fetchBusinessFriction();
        if (businessTop) overview.topFrictionByLens.business = businessTop;
        return overview;
      }

      const reviewCount = await fetchProcessedReviewCount();
      if (reviewCount > 0) {
        const businessTop = await fetchBusinessFriction();
        return {
          generatedAt: new Date().toISOString(),
          totalReviews: reviewCount,
          dominantThemes: [],
          sentimentTrend: { positive: 0, neutral: 0, negative: 0, negativePct: 0 },
          topFrictionByLens: {
            business: businessTop,
            engagement: null,
            behavior: null,
            context: null,
            pain: null,
          },
          topOpportunity: null,
          executiveSummary: {
            text: "Review data is loaded. Insight summaries will appear after the next weekly pipeline run.",
            tier: "Monitor",
            quotes: [],
            reviewCount,
          },
          dataSource: "supabase",
        };
      }
    } catch {
      /* fall through to local */
    }
  }

  const local = await loadOverviewFromLocal();
  if (local) {
    const businessTop = await fetchBusinessFriction();
    if (businessTop) local.topFrictionByLens.business = businessTop;
    return local;
  }

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
