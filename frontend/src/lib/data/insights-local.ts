import type { InsightAnswer, InsightsData, InsightTopicId } from "../insights/catalog";
import { getTopicMeta } from "../insights/catalog";
import { filterQuotes, sanitizeInsightSummary, sanitizePainPoint } from "../copy/sanitize";
import { prepareThemesForDisplay, displayThemeName } from "../copy/theme-display";
import { resolveCorpusReviewCount } from "./corpus-metrics";
import { readLocalOutputJson } from "./read-local-json";

function normalizeAnswer(raw: Record<string, unknown>): InsightAnswer | null {
  const topicId = raw.question_id as string;
  const meta = getTopicMeta(topicId);
  if (!meta) return null;

  const metrics = (raw.supporting_metrics ?? {}) as Record<string, unknown>;
  const sentiment = (metrics.sentiment_breakdown ?? {}) as Record<string, number>;
  const clusters = (raw.related_clusters ?? []) as Array<Record<string, unknown>>;

  return {
    topicId: topicId as InsightTopicId,
    label: meta.label,
    shortLabel: meta.shortLabel,
    description: meta.description,
    filterGroup: meta.filterGroup,
    findingSummary: sanitizeInsightSummary((raw.finding_summary as string) ?? ""),
    reviewCount: (metrics.review_count as number) ?? 0,
    sentiment: {
      positive: sentiment.positive ?? 0,
      neutral: sentiment.neutral ?? 0,
      negative: sentiment.negative ?? 0,
      negativePct: sentiment.negative_pct ?? 0,
    },
    topThemes: prepareThemesForDisplay(
      ((metrics.top_themes as InsightAnswer["topThemes"]) ?? []).map((t) => ({
        ...t,
        theme: displayThemeName(t.theme),
      }))
    ),
    segmentBreakdown: (metrics.segment_breakdown as InsightAnswer["segmentBreakdown"]) ?? [],
    affectedSegments: (raw.affected_segments as string[]) ?? [],
    quotes: filterQuotes((raw.representative_quotes as string[]) ?? []),
    avgRating: metrics.avg_rating as number | undefined,
    relatedClusters: clusters.map((c) => ({
      clusterId: c.cluster_id as number,
      reviewCount: c.review_count as number,
      painPoint: sanitizePainPoint(c.pain_point as string),
      severity: c.severity as number,
      productOpportunity: sanitizePainPoint(c.product_opportunity as string),
    })),
  };
}

function buildInsights(
  payload: Record<string, unknown>,
  source: "supabase" | "local",
  prioritization?: Record<string, unknown> | null
): InsightsData {
  const answers = (payload.answers ?? []) as Array<Record<string, unknown>>;
  const topics = answers
    .map(normalizeAnswer)
    .filter((t): t is InsightAnswer => t !== null);

  return {
    generatedAt: (payload.generated_at as string) ?? new Date().toISOString(),
    totalReviews: resolveCorpusReviewCount({
      problemStatement: payload,
      prioritization,
    }),
    topics,
    dataSource: source,
  };
}
async function readLocalPayload(): Promise<Record<string, unknown> | null> {
  return readLocalOutputJson<Record<string, unknown>>(
    "problem_statement_insights.json"
  );
}

export async function loadInsightsFromLocal(): Promise<InsightsData | null> {
  const payload = await readLocalPayload();
  if (!payload) return null;
  return buildInsights(payload, "local");
}

export function parseInsightsPayload(
  payload: Record<string, unknown>,
  source: "supabase" | "local",
  prioritization?: Record<string, unknown> | null
): InsightsData {
  return buildInsights(payload, source, prioritization);
}