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

/** Single canonical review count for the 90-day analysis window — used on every dashboard screen. */
export function resolveCorpusReviewCount(sources: CorpusPayloadSources): number {
  const candidates = [
    sources.prioritization?.total_reviews_analyzed,
    sources.problemStatement?.total_reviews_analyzed,
    sources.segmentDeepDives?.total_reviews_analyzed,
    sources.opportunities?.total_reviews_analyzed,
    sources.weeklyReport?.total_reviews_analyzed,
    getCorpusMetrics(sources.problemStatement)?.review_count,
    sources.fallback,
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}
