import { cache } from "react";
import {
  normalizeBehavioralSegment,
  parseReviewThemes,
} from "./behavioral-segment";
import {
  analysisWindowEndFromAnchor,
  analysisWindowStartFromAnchor,
} from "./analysis-window";
import {
  resolveAnalysisAnchorDate,
} from "./weekly-insights-merge";
import type { CorpusPayloadSources } from "./corpus-metrics";
import { getSupabaseServerClient } from "../supabase/server";
import { displayThemeName } from "../copy/theme-display";

export const BEHAVIORAL_SEGMENTS = [
  "Discovery Seeker",
  "Habit Listener",
  "Heavy Listener",
  "Playlist Driven",
  "Niche Listener",
  "Casual Listener",
] as const;

const DISCOVERY_THEME_KEYWORDS = [
  "discover",
  "repetitive",
  "recommendation",
  "playlist fatigue",
  "algorithm",
  "search",
  "niche",
  "explore",
];

const HIGH_FRICTION_SEGMENTS = new Set([
  "Playlist Driven",
  "Habit Listener",
  "Discovery Seeker",
]);

const REC_FATIGUE_TEXT =
  /\b(recommend|suggest|algorithm|discover weekly|daily mix|repetitive|boring)\b/i;

export type WindowReviewRow = {
  userSegment: string;
  cleanedText: string;
  themes: string[];
  sentimentLabel: string;
  sentimentScore: number | null;
  clusterId: number | null;
  painPoints: unknown;
  behavioralSegment: string;
};

export type SegmentWindowStats = {
  segment: string;
  reviewCount: number;
  negativePct: number;
  frictionScore: number;
  painPointDensity: number;
  discoveryThemePct: number;
  avgClusterSeverity: number | null;
};

export type WindowCorpus = {
  anchor: Date;
  windowStart: string;
  windowEnd: string;
  totalReviews: number;
  reviews: WindowReviewRow[];
  byBehavior: Map<string, WindowReviewRow[]>;
  byCluster: Map<number, WindowReviewRow[]>;
  byPhase2: Map<string, WindowReviewRow[]>;
  segmentStats: SegmentWindowStats[];
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
    negativePct: number;
  };
  clusterSeverity: Map<number, number>;
  recommendationFatigueRank: Array<{ segment: string; score: number; reviewCount: number }>;
};

function isDiscoveryTheme(theme: string): boolean {
  const t = theme.toLowerCase();
  return DISCOVERY_THEME_KEYWORDS.some((kw) => t.includes(kw));
}

function extractPainPoint(painPoints: unknown): string | null {
  if (!painPoints) return null;
  if (Array.isArray(painPoints)) {
    for (const item of painPoints) {
      if (typeof item === "object" && item && "pain_point" in item) {
        const pp = (item as { pain_point?: string }).pain_point;
        if (pp) return String(pp);
      }
      if (typeof item === "string" && item.trim()) return item;
    }
  }
  return null;
}

async function fetchClusterSeverities(): Promise<Map<number, number>> {
  const client = getSupabaseServerClient();
  const map = new Map<number, number>();
  if (!client) return map;

  try {
    const { data } = await client.from("cluster_insights").select("cluster_id, severity");
    for (const row of data ?? []) {
      map.set(row.cluster_id as number, Number(row.severity ?? 3));
    }
  } catch {
    /* optional */
  }
  return map;
}

function computeSegmentStats(
  reviews: WindowReviewRow[],
  severityByCluster: Map<number, number>
): SegmentWindowStats[] {
  const stats: SegmentWindowStats[] = [];

  for (const segment of BEHAVIORAL_SEGMENTS) {
    const segReviews = reviews.filter((r) => r.behavioralSegment === segment);
    const n = segReviews.length;
    if (n === 0) {
      stats.push({
        segment,
        reviewCount: 0,
        negativePct: 0,
        frictionScore: 0,
        painPointDensity: 0,
        discoveryThemePct: 0,
        avgClusterSeverity: null,
      });
      continue;
    }

    const negative = segReviews.filter((r) => r.sentimentLabel === "negative").length;
    const negativePct = (100 * negative) / n;
    const withPain = segReviews.filter((r) => extractPainPoint(r.painPoints)).length;
    const painPointDensity = withPain / n;
    const discoveryHits = segReviews.filter((r) =>
      r.themes.some((t) => isDiscoveryTheme(t))
    ).length;
    const discoveryThemePct = (100 * discoveryHits) / n;

    const severities = segReviews
      .map((r) => (r.clusterId != null ? severityByCluster.get(r.clusterId) : undefined))
      .filter((s): s is number => s != null);
    const avgClusterSeverity =
      severities.length > 0
        ? Math.round((severities.reduce((a, b) => a + b, 0) / severities.length) * 100) / 100
        : null;

    let friction =
      0.35 * (negativePct / 100) +
      0.3 * painPointDensity +
      0.35 * (discoveryThemePct / 100);
    if (avgClusterSeverity != null) {
      friction = Math.min(1, friction * (avgClusterSeverity / 5));
    }

    stats.push({
      segment,
      reviewCount: n,
      negativePct: Math.round(negativePct * 10) / 10,
      frictionScore: Math.round(friction * 10000) / 10000,
      painPointDensity: Math.round(painPointDensity * 1000) / 1000,
      discoveryThemePct: Math.round(discoveryThemePct * 10) / 10,
      avgClusterSeverity,
    });
  }

  return stats.sort((a, b) => b.frictionScore - a.frictionScore);
}

function computeRecommendationFatigueRank(
  reviews: WindowReviewRow[]
): Array<{ segment: string; score: number; reviewCount: number }> {
  const scores = new Map<string, number>();

  for (const segment of BEHAVIORAL_SEGMENTS) {
    const segReviews = reviews.filter((r) => r.behavioralSegment === segment);
    let score = 0;
    for (const r of segReviews) {
      const themeHit = r.themes.some((t) => {
        const tl = t.toLowerCase();
        return (
          tl.includes("repetitive") ||
          tl.includes("playlist fatigue") ||
          tl.includes("recommendation")
        );
      });
      const textHit = REC_FATIGUE_TEXT.test(r.cleanedText);
      if (!themeHit && !textHit) continue;
      score += 1;
      if (r.sentimentLabel === "negative") score += 1.5;
      if (r.sentimentScore != null && r.sentimentScore <= 2) score += 0.5;
    }
    scores.set(segment, score);
  }

  return BEHAVIORAL_SEGMENTS.map((segment) => ({
    segment,
    score: scores.get(segment) ?? 0,
    reviewCount: reviews.filter((r) => r.behavioralSegment === segment).length,
  }))
    .filter((r) => r.reviewCount > 0)
    .sort((a, b) => b.score - a.score);
}

async function fetchWindowCorpusAtAnchor(anchor: Date): Promise<WindowCorpus | null> {
  const client = getSupabaseServerClient();
  if (!client) return null;

  const windowStart = analysisWindowStartFromAnchor(anchor);
  const windowEnd = analysisWindowEndFromAnchor(anchor);
  const severityByCluster = await fetchClusterSeverities();

  const reviews: WindowReviewRow[] = [];
  let offset = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await client
      .from("processed_reviews")
      .select(
        "user_segment, cleaned_text, themes, sentiment_label, sentiment_score, cluster_id, pain_points, raw_reviews!inner(review_date)"
      )
      .gte("raw_reviews.review_date", windowStart)
      .lte("raw_reviews.review_date", windowEnd)
      .range(offset, offset + PAGE - 1);

    if (error || !data?.length) break;

    for (const row of data) {
      const themes = parseReviewThemes(row.themes).map((t) => displayThemeName(t));
      const cleanedText = (row.cleaned_text as string) ?? "";
      const userSegment = (row.user_segment as string) ?? "";
      reviews.push({
        userSegment,
        cleanedText,
        themes,
        sentimentLabel: (row.sentiment_label as string) ?? "unknown",
        sentimentScore:
          row.sentiment_score != null ? Number(row.sentiment_score) : null,
        clusterId: row.cluster_id != null ? Number(row.cluster_id) : null,
        painPoints: row.pain_points,
        behavioralSegment: normalizeBehavioralSegment(userSegment, cleanedText, themes),
      });
    }

    if (data.length < PAGE) break;
    offset += PAGE;
  }

  if (!reviews.length) return null;

  const byBehavior = new Map<string, WindowReviewRow[]>();
  const byCluster = new Map<number, WindowReviewRow[]>();
  const byPhase2 = new Map<string, WindowReviewRow[]>();

  for (const r of reviews) {
    if (!byBehavior.has(r.behavioralSegment)) byBehavior.set(r.behavioralSegment, []);
    byBehavior.get(r.behavioralSegment)!.push(r);

    if (r.clusterId != null) {
      if (!byCluster.has(r.clusterId)) byCluster.set(r.clusterId, []);
      byCluster.get(r.clusterId)!.push(r);
    }

    const p2 = r.userSegment || "Casual Listener";
    if (!byPhase2.has(p2)) byPhase2.set(p2, []);
    byPhase2.get(p2)!.push(r);
  }

  const positive = reviews.filter((r) => r.sentimentLabel === "positive").length;
  const neutral = reviews.filter((r) => r.sentimentLabel === "neutral").length;
  const negative = reviews.filter((r) => r.sentimentLabel === "negative").length;
  const total = reviews.length || 1;

  return {
    anchor,
    windowStart,
    windowEnd,
    totalReviews: reviews.length,
    reviews,
    byBehavior,
    byCluster,
    byPhase2,
    segmentStats: computeSegmentStats(reviews, severityByCluster),
    sentiment: {
      positive,
      neutral,
      negative,
      negativePct: Math.round((100 * negative) / total * 10) / 10,
    },
    clusterSeverity: severityByCluster,
    recommendationFatigueRank: computeRecommendationFatigueRank(reviews),
  };
}

const loadWindowCorpusForAnchor = cache(async (anchorIso: string): Promise<WindowCorpus | null> => {
  const anchor = new Date(anchorIso);
  if (Number.isNaN(anchor.getTime())) return null;
  return fetchWindowCorpusAtAnchor(anchor);
});

/** Load all processed reviews in the 90-day window anchored to the last weekly run. */
export async function getWindowCorpus(
  sources: CorpusPayloadSources = {}
): Promise<WindowCorpus | null> {
  const anchor = await resolveAnalysisAnchorDate(sources);
  return loadWindowCorpusForAnchor(anchor.toISOString());
}

export function segmentBreakdownFromCorpus(corpus: WindowCorpus) {
  const total = corpus.totalReviews || 1;
  return BEHAVIORAL_SEGMENTS.map((segment) => ({
    segment,
    count: corpus.byBehavior.get(segment)?.length ?? 0,
    pct: Math.round((100 * (corpus.byBehavior.get(segment)?.length ?? 0)) / total * 10) / 10,
  }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

const INSIGHT_QUESTION_FILTERS: Record<
  string,
  { themeKeywords: string[]; textKeywords: string[] }
> = {
  discovery_struggle: {
    themeKeywords: [
      "discover",
      "discovery",
      "explore",
      "find new",
      "recommendation quality",
      "niche",
      "algorithm",
    ],
    textKeywords: ["discover", "explore", "find new", "can't find", "hard to find"],
  },
  recommendation_frustrations: {
    themeKeywords: ["repetitive", "recommendation", "playlist fatigue", "algorithm", "quality"],
    textKeywords: ["recommend", "suggest", "same songs", "repeat", "algorithm"],
  },
  listening_behaviors: {
    themeKeywords: ["playlist", "mood", "comfort", "background", "workout", "sleep"],
    textKeywords: [
      "listen while",
      "background",
      "mood",
      "workout",
      "sleep",
      "study",
      "comfort",
      "relax",
      "party",
      "commute",
    ],
  },
  repetitive_listening: {
    themeKeywords: ["repetitive", "playlist fatigue", "same", "repeat"],
    textKeywords: [
      "same song",
      "same artist",
      "repeat",
      "over and over",
      "again and again",
      "playlist fatigue",
      "hear the same",
    ],
  },
  segment_discovery_challenges: {
    themeKeywords: ["discover", "repetitive", "recommendation", "playlist fatigue", "niche"],
    textKeywords: ["discover", "recommend", "repeat", "explore"],
  },
  unmet_needs: {
    themeKeywords: [],
    textKeywords: ["wish", "need", "want", "should", "missing", "lack"],
  },
};

function matchesQuestion(
  review: WindowReviewRow,
  themeKeywords: string[],
  textKeywords: string[]
): boolean {
  if (!themeKeywords.length && !textKeywords.length) return true;
  const haystack =
    review.themes.join(" ").toLowerCase() + " " + review.cleanedText.toLowerCase();
  if (themeKeywords.some((kw) => haystack.includes(kw.toLowerCase()))) return true;
  if (textKeywords.some((kw) => haystack.includes(kw.toLowerCase()))) return true;
  return false;
}

export function filterReviewsForInsightTopic(
  corpus: WindowCorpus,
  topicId: string
): WindowReviewRow[] {
  const filters = INSIGHT_QUESTION_FILTERS[topicId];
  if (!filters) return corpus.reviews;
  return corpus.reviews.filter((r) =>
    matchesQuestion(r, filters.themeKeywords, filters.textKeywords)
  );
}

export function insightTopicBreakdown(corpus: WindowCorpus, topicId: string) {
  const subset = filterReviewsForInsightTopic(corpus, topicId);
  const total = subset.length || 1;
  const counts = new Map<string, number>();
  for (const r of subset) {
    counts.set(r.behavioralSegment, (counts.get(r.behavioralSegment) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([segment, count]) => ({
      segment,
      count,
      pct: Math.round((100 * count) / total * 10) / 10,
    }))
    .sort((a, b) => b.count - a.count);
}

export function computeOpportunityScoreFromReviews(
  reviews: WindowReviewRow[],
  maxCount: number,
  severity: number
) {
  const frequency = maxCount > 0 ? reviews.length / maxCount : 0;
  const severityNorm = Math.max(1, Math.min(5, severity)) / 5;
  const frictionCount = reviews.filter((r) =>
    HIGH_FRICTION_SEGMENTS.has(r.behavioralSegment)
  ).length;
  const segmentImpact = reviews.length ? frictionCount / reviews.length : 0;
  const negative = reviews.filter((r) => r.sentimentLabel === "negative").length;
  const negativePct = reviews.length ? negative / reviews.length : 0;
  const magnitudes = reviews
    .filter((r) => r.sentimentScore != null)
    .map((r) => Math.max(0, (3 - Number(r.sentimentScore)) / 2));
  const avgMagnitude = magnitudes.length
    ? magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length
    : 0;
  const sentimentIntensity = Math.min(1, (negativePct + avgMagnitude) / 2);
  const composite =
    Math.round(frequency * severityNorm * segmentImpact * sentimentIntensity * 1e6) / 1e6;
  return {
    frequency: Math.round(frequency * 10000) / 10000,
    severity: Math.round(severityNorm * 10000) / 10000,
    segmentImpact: Math.round(segmentImpact * 10000) / 10000,
    sentimentIntensity: Math.round(sentimentIntensity * 10000) / 10000,
    composite,
  };
}

export function assignOpportunityTier(composite: number, rank: number): string {
  if (rank <= 2 || composite >= 0.12) return "Critical";
  if (rank <= 5 || composite >= 0.06) return "High";
  return "Monitor";
}
