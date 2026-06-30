/** Project-wide metrics from the full 90-day review corpus (not per-question subsets). */

type ProblemAnswer = {
  question_id?: string;
  supporting_metrics?: {
    review_count?: number;
    sentiment_breakdown?: {
      positive: number;
      neutral: number;
      negative: number;
      negative_pct: number;
    };
    top_themes?: Array<{ theme: string; count: number }>;
  };
};

export type CorpusPayloadSources = {
  prioritization?: Record<string, unknown> | null;
  problemStatement?: Record<string, unknown> | null;
  segmentDeepDives?: Record<string, unknown> | null;
  opportunities?: Record<string, unknown> | null;
  weeklyReport?: Record<string, unknown> | null;
  dashboardSnapshot?: Record<string, unknown> | null;
  fallback?: number;
};

export function getCorpusAnswer(
  problemStatement: Record<string, unknown> | null | undefined
): ProblemAnswer | undefined {
  const answers = (problemStatement?.answers ?? []) as ProblemAnswer[];
  if (!answers.length) return undefined;

  const corpusWide = answers.find((a) => a.question_id === "recommendation_frustrations");
  if (corpusWide) return corpusWide;

  return answers.reduce((best, answer) => {
    const count = answer.supporting_metrics?.review_count ?? 0;
    const bestCount = best?.supporting_metrics?.review_count ?? 0;
    return count > bestCount ? answer : best;
  }, answers[0]);
}

export function getCorpusMetrics(problemStatement: Record<string, unknown> | null | undefined) {
  return getCorpusAnswer(problemStatement)?.supporting_metrics ?? null;
}

/**
 * Authoritative 90-day corpus count from Phase 3 weekly outputs.
 * weekly_report / dashboard_snapshot first — never problem_statement top-level totals
 * (partial runs can reflect full DB corpus ~152k).
 */
export function resolveCorpusReviewCount(sources: CorpusPayloadSources): number {
  const candidates = [
    sources.weeklyReport?.total_reviews_analyzed,
    sources.dashboardSnapshot?.total_reviews_analyzed,
    sources.prioritization?.total_reviews_analyzed,
    sources.segmentDeepDives?.total_reviews_analyzed,
    sources.opportunities?.total_reviews_analyzed,
    sources.fallback,
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** Problem-statement metrics scoped to the same corpus count when possible. */
export function getCorpusMetricsForWindow(
  problemStatement: Record<string, unknown> | null | undefined,
  corpusTotal: number
): ReturnType<typeof getCorpusMetrics> {
  const metrics = getCorpusMetrics(problemStatement);
  if (!metrics || !corpusTotal) return metrics;

  const answerCount = metrics.review_count ?? 0;
  if (answerCount > 0 && answerCount <= corpusTotal * 1.05) return metrics;
  return null;
}
