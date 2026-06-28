import { filterQuotes, sanitizeRecommendation } from "../copy/sanitize";
import type { OpportunityItem, OpportunitiesData } from "../opportunities/types";
import { readLocalOutputJson } from "./read-local-json";

function normalizeOpportunity(raw: Record<string, unknown>): OpportunityItem {
  const scores = (raw.scores ?? {}) as Record<string, number>;
  const evidence = (raw.evidence ?? {}) as Record<string, unknown>;

  return {
    id: raw.opportunity_id as string,
    clusterId: raw.cluster_id as number,
    rank: raw.rank as number,
    tier: raw.tier as string,
    painPoint: sanitizeRecommendation(raw.pain_point as string),
    productOpportunity: sanitizeRecommendation(raw.product_opportunity as string),
    featureRequest: sanitizeRecommendation(raw.feature_request as string),
    themes: (raw.themes ?? []) as string[],
    reviewCount: raw.review_count as number,
    scores: {
      frequency: scores.frequency ?? 0,
      severity: scores.severity ?? 0,
      segmentImpact: scores.segment_impact ?? 0,
      sentimentIntensity: scores.sentiment_intensity ?? 0,
      composite: scores.composite ?? 0,
    },
    segments: (evidence.segment_breakdown ?? []) as OpportunityItem["segments"],
    themeBreakdown: (evidence.theme_breakdown ?? []) as OpportunityItem["themeBreakdown"],
    quotes: filterQuotes((evidence.representative_quotes ?? []) as string[]),
    dominantSentiment: (evidence.dominant_sentiment as string) ?? "mixed",
  };
}

export function parseOpportunitiesPayload(
  payload: Record<string, unknown>,
  source: "supabase" | "local"
): OpportunitiesData {
  const opps = (payload.opportunities ?? []) as Array<Record<string, unknown>>;
  return {
    generatedAt: (payload.generated_at as string) ?? new Date().toISOString(),
    totalReviews: (payload.total_reviews_analyzed as number) ?? 0,
    scoringFormula:
      (payload.scoring_formula as string) ??
      "Frequency × Severity × Segment Impact × Sentiment Intensity",
    opportunities: opps.map(normalizeOpportunity).sort((a, b) => a.rank - b.rank),
    dataSource: source,
  };
}

export async function loadOpportunitiesFromLocal(): Promise<OpportunitiesData | null> {
  const payload = await readLocalOutputJson<Record<string, unknown>>(
    "opportunity_scores.json"
  );
  if (!payload) return null;
  return parseOpportunitiesPayload(payload, "local");
}
