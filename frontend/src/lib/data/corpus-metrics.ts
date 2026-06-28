/** Project-wide metrics from the full review corpus (not a single discovery question). */

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
