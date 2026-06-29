import { cache } from "react";
import {
  normalizeBehavioralSegment,
  parseReviewThemes,
} from "./behavioral-segment";
import {
  analysisWindowEndFromAnchor,
  analysisWindowStartFromAnchor,
} from "./analysis-window";
import { resolveAnalysisAnchorDate } from "./weekly-insights-merge";
import type { CorpusPayloadSources } from "./corpus-metrics";
import { getSupabaseServerClient } from "../supabase/server";
import { displayThemeName } from "../copy/theme-display";
import {
  bumpMatrixCell,
  emptyHeatmapMatrix,
  type HeatmapMatrix,
} from "./analytics-heatmap";

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

const PAGE_SIZE = 8000;
const PARALLEL_PAGES = 8;
const CORPUS_FETCH_TIMEOUT_MS = 12_000;
const MEMORY_CORPUS_TTL_MS = 30 * 60 * 1000;

/** Compact select — omits cleaned_text (~80% payload reduction). */
const WINDOW_LITE_SELECT =
  "user_segment, themes, sentiment_label, sentiment_score, cluster_id, pain_points, raw_reviews!inner(review_date)";

const memoryCorpusCache = new Map<string, { at: number; corpus: WindowCorpus }>();

export type WindowReviewLite = {
  behavioralSegment: string;
  sentimentLabel: string;
  sentimentScore: number | null;
};

export type SegmentWindowStats = {
  segment: string;
  reviewCount: number;
  negativePct: number;
  frictionScore: number;
  painPointDensity: number;
  discoveryThemePct: number;
  avgClusterSeverity: number | null;
  topClusters: { clusterId: number; reviewCount: number }[];
};

export type InsightTopicStats = {
  reviewCount: number;
  segmentBreakdown: { segment: string; count: number; pct: number }[];
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
    negativePct: number;
  };
};

export type WindowCorpus = {
  anchor: Date;
  windowStart: string;
  windowEnd: string;
  totalReviews: number;
  byCluster: Map<number, WindowReviewLite[]>;
  segmentStats: SegmentWindowStats[];
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
    negativePct: number;
  };
  clusterSeverity: Map<number, number>;
  recommendationFatigueRank: Array<{ segment: string; score: number; reviewCount: number }>;
  insightTopics: Record<string, InsightTopicStats>;
  dominantThemes: { theme: string; count: number }[];
  heatmapMatrix: HeatmapMatrix;
  phase2Stats: Map<
    string,
    { reviewCount: number; negativePct: number; frictionScore: number }
  >;
};

type SegmentAccum = {
  count: number;
  negative: number;
  withPain: number;
  discoveryHits: number;
  severities: number[];
  clusterCounts: Map<number, number>;
  fatigueScore: number;
};

type TopicAccum = {
  count: number;
  positive: number;
  neutral: number;
  negative: number;
  bySegment: Map<string, number>;
};

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

function matchesTopic(
  themes: string[],
  painText: string,
  themeKeywords: string[],
  textKeywords: string[]
): boolean {
  if (!themeKeywords.length && !textKeywords.length) return true;
  const haystack = themes.join(" ").toLowerCase() + " " + painText.toLowerCase();
  if (themeKeywords.some((kw) => haystack.includes(kw.toLowerCase()))) return true;
  return false;
}

function painTextFromRow(painPoints: unknown): string {
  const pp = extractPainPoint(painPoints);
  if (pp) return pp;
  if (Array.isArray(painPoints)) {
    return painPoints.filter((x) => typeof x === "string").join(" ");
  }
  return "";
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

type ParsedRow = {
  userSegment: string;
  themes: string[];
  sentimentLabel: string;
  sentimentScore: number | null;
  clusterId: number | null;
  painPoints: unknown;
  behavioralSegment: string;
  lite: WindowReviewLite;
};

function parseRow(row: Record<string, unknown>): ParsedRow {
  const themes = parseReviewThemes(row.themes).map((t) => displayThemeName(t));
  const userSegment = (row.user_segment as string) ?? "";
  const behavioralSegment = normalizeBehavioralSegment(userSegment, "", themes);
  const sentimentLabel = (row.sentiment_label as string) ?? "unknown";
  const sentimentScore =
    row.sentiment_score != null ? Number(row.sentiment_score) : null;
  const clusterId = row.cluster_id != null ? Number(row.cluster_id) : null;

  return {
    userSegment,
    themes,
    sentimentLabel,
    sentimentScore,
    clusterId,
    painPoints: row.pain_points,
    behavioralSegment,
    lite: { behavioralSegment, sentimentLabel, sentimentScore },
  };
}

function ingestRow(
  row: ParsedRow,
  severityByCluster: Map<number, number>,
  segmentAcc: Map<string, SegmentAccum>,
  phase2Acc: Map<string, { count: number; negative: number }>,
  topicAcc: Map<string, TopicAccum>,
  byCluster: Map<number, WindowReviewLite[]>,
  themeCounts: Map<string, number>,
  heatmap: HeatmapMatrix
) {
  const seg = row.behavioralSegment;
  const acc = segmentAcc.get(seg) ?? {
    count: 0,
    negative: 0,
    withPain: 0,
    discoveryHits: 0,
    severities: [],
    clusterCounts: new Map<number, number>(),
    fatigueScore: 0,
  };
  acc.count++;
  if (row.sentimentLabel === "negative") acc.negative++;
  if (extractPainPoint(row.painPoints)) acc.withPain++;
  if (row.themes.some((t) => isDiscoveryTheme(t))) acc.discoveryHits++;
  if (row.clusterId != null) {
    acc.severities.push(severityByCluster.get(row.clusterId) ?? 3);
    acc.clusterCounts.set(row.clusterId, (acc.clusterCounts.get(row.clusterId) ?? 0) + 1);
    if (!byCluster.has(row.clusterId)) byCluster.set(row.clusterId, []);
    byCluster.get(row.clusterId)!.push(row.lite);
  }

  const themeHit = row.themes.some((t) => {
    const tl = t.toLowerCase();
    return (
      tl.includes("repetitive") ||
      tl.includes("playlist fatigue") ||
      tl.includes("recommendation")
    );
  });
  if (themeHit) {
    acc.fatigueScore += 1;
    if (row.sentimentLabel === "negative") acc.fatigueScore += 1.5;
    if (row.sentimentScore != null && row.sentimentScore <= 2) acc.fatigueScore += 0.5;
  }
  segmentAcc.set(seg, acc);

  const p2 = row.userSegment || "Casual Listener";
  const p2a = phase2Acc.get(p2) ?? { count: 0, negative: 0 };
  p2a.count++;
  if (row.sentimentLabel === "negative") p2a.negative++;
  phase2Acc.set(p2, p2a);

  const painText = painTextFromRow(row.painPoints);
  for (const [topicId, filters] of Object.entries(INSIGHT_QUESTION_FILTERS)) {
    if (!matchesTopic(row.themes, painText, filters.themeKeywords, filters.textKeywords)) {
      continue;
    }
    const ta = topicAcc.get(topicId) ?? {
      count: 0,
      positive: 0,
      neutral: 0,
      negative: 0,
      bySegment: new Map<string, number>(),
    };
    ta.count++;
    if (row.sentimentLabel === "positive") ta.positive++;
    else if (row.sentimentLabel === "negative") ta.negative++;
    else ta.neutral++;
    ta.bySegment.set(seg, (ta.bySegment.get(seg) ?? 0) + 1);
    topicAcc.set(topicId, ta);
  }

  const displayThemes = row.themes.length
    ? row.themes
    : [displayThemeName("General app experience")];
  for (const theme of displayThemes) {
    bumpMatrixCell(heatmap, theme, seg, 1);
    themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
  }
}

function finalizeSegmentStats(
  segmentAcc: Map<string, SegmentAccum>,
  severityByCluster: Map<number, number>
): SegmentWindowStats[] {
  const stats: SegmentWindowStats[] = [];

  for (const segment of BEHAVIORAL_SEGMENTS) {
    const acc = segmentAcc.get(segment);
    if (!acc || acc.count === 0) {
      stats.push({
        segment,
        reviewCount: 0,
        negativePct: 0,
        frictionScore: 0,
        painPointDensity: 0,
        discoveryThemePct: 0,
        avgClusterSeverity: null,
        topClusters: [],
      });
      continue;
    }

    const n = acc.count;
    const negativePct = (100 * acc.negative) / n;
    const painPointDensity = acc.withPain / n;
    const discoveryThemePct = (100 * acc.discoveryHits) / n;
    const avgClusterSeverity =
      acc.severities.length > 0
        ? Math.round((acc.severities.reduce((a, b) => a + b, 0) / acc.severities.length) * 100) /
          100
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
      topClusters: [...acc.clusterCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([clusterId, reviewCount]) => ({ clusterId, reviewCount })),
    });
  }

  return stats.sort((a, b) => b.frictionScore - a.frictionScore);
}

function finalizeInsightTopics(topicAcc: Map<string, TopicAccum>): Record<string, InsightTopicStats> {
  const out: Record<string, InsightTopicStats> = {};
  for (const [topicId, ta] of topicAcc) {
    const total = ta.count || 1;
    const segmentBreakdown = [...ta.bySegment.entries()]
      .map(([segment, count]) => ({
        segment,
        count,
        pct: Math.round((100 * count) / total * 10) / 10,
      }))
      .sort((a, b) => b.count - a.count);
    out[topicId] = {
      reviewCount: ta.count,
      segmentBreakdown,
      sentiment: {
        positive: ta.positive,
        neutral: ta.neutral,
        negative: ta.negative,
        negativePct: Math.round((100 * ta.negative) / total * 10) / 10,
      },
    };
  }
  return out;
}

function finalizeFatigueRank(segmentAcc: Map<string, SegmentAccum>) {
  return BEHAVIORAL_SEGMENTS.map((segment) => ({
    segment,
    score: segmentAcc.get(segment)?.fatigueScore ?? 0,
    reviewCount: segmentAcc.get(segment)?.count ?? 0,
  }))
    .filter((r) => r.reviewCount > 0)
    .sort((a, b) => b.score - a.score);
}

async function fetchWindowPage(
  windowStart: string,
  windowEnd: string,
  offset: number
): Promise<ParsedRow[]> {
  const client = getSupabaseServerClient();
  if (!client) return [];

  const { data, error } = await client
    .from("processed_reviews")
    .select(WINDOW_LITE_SELECT)
    .gte("raw_reviews.review_date", windowStart)
    .lte("raw_reviews.review_date", windowEnd)
    .range(offset, offset + PAGE_SIZE - 1);

  if (error || !data?.length) return [];
  return data.map((row) => parseRow(row as Record<string, unknown>));
}

async function aggregateWindowCorpus(
  windowStart: string,
  windowEnd: string
): Promise<Omit<
  WindowCorpus,
  "anchor" | "windowStart" | "windowEnd"
> | null> {
  const client = getSupabaseServerClient();
  if (!client) return null;

  const [{ count, error: countError }, severityByCluster] = await Promise.all([
    client
      .from("processed_reviews")
      .select("id, raw_reviews!inner(review_date)", { count: "exact", head: true })
      .gte("raw_reviews.review_date", windowStart)
      .lte("raw_reviews.review_date", windowEnd),
    fetchClusterSeverities(),
  ]);

  if (countError || !count) return null;

  const segmentAcc = new Map<string, SegmentAccum>();
  const phase2Acc = new Map<string, { count: number; negative: number }>();
  const topicAcc = new Map<string, TopicAccum>();
  const byCluster = new Map<number, WindowReviewLite[]>();
  const themeCounts = new Map<string, number>();
  const heatmap = emptyHeatmapMatrix();

  let positive = 0;
  let neutral = 0;
  let negative = 0;
  let total = 0;

  const pageCount = Math.ceil(count / PAGE_SIZE);
  for (let batchStart = 0; batchStart < pageCount; batchStart += PARALLEL_PAGES) {
    const batchEnd = Math.min(batchStart + PARALLEL_PAGES, pageCount);
    const pages = await Promise.all(
      Array.from({ length: batchEnd - batchStart }, (_, i) => {
        const pageIndex = batchStart + i;
        return fetchWindowPage(windowStart, windowEnd, pageIndex * PAGE_SIZE);
      })
    );

    for (const page of pages) {
      for (const row of page) {
        total++;
        if (row.sentimentLabel === "positive") positive++;
        else if (row.sentimentLabel === "negative") negative++;
        else neutral++;
        ingestRow(
          row,
          severityByCluster,
          segmentAcc,
          phase2Acc,
          topicAcc,
          byCluster,
          themeCounts,
          heatmap
        );
      }
    }
  }

  if (total === 0) return null;

  const phase2Stats = new Map<
    string,
    { reviewCount: number; negativePct: number; frictionScore: number }
  >();
  for (const [name, acc] of phase2Acc) {
    const negativePct = acc.count ? (100 * acc.negative) / acc.count : 0;
    phase2Stats.set(name, {
      reviewCount: acc.count,
      negativePct,
      frictionScore: negativePct / 100,
    });
  }

  const dominantThemes = [...themeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([theme, themeCount]) => ({ theme, count: themeCount }));

  return {
    totalReviews: total,
    byCluster,
    segmentStats: finalizeSegmentStats(segmentAcc, severityByCluster),
    sentiment: {
      positive,
      neutral,
      negative,
      negativePct: Math.round((100 * negative) / (total || 1) * 10) / 10,
    },
    clusterSeverity: severityByCluster,
    recommendationFatigueRank: finalizeFatigueRank(segmentAcc),
    insightTopics: finalizeInsightTopics(topicAcc),
    dominantThemes,
    heatmapMatrix: heatmap,
    phase2Stats,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);
}

async function fetchWindowCorpusAtAnchor(anchor: Date): Promise<WindowCorpus | null> {
  const cacheKey = anchor.toISOString();
  const cached = memoryCorpusCache.get(cacheKey);
  if (cached && Date.now() - cached.at < MEMORY_CORPUS_TTL_MS) {
    return cached.corpus;
  }

  const windowStart = analysisWindowStartFromAnchor(anchor);
  const windowEnd = analysisWindowEndFromAnchor(anchor);

  const aggregated = await withTimeout(
    aggregateWindowCorpus(windowStart, windowEnd),
    CORPUS_FETCH_TIMEOUT_MS
  );

  if (!aggregated) return null;

  const corpus: WindowCorpus = {
    anchor,
    windowStart,
    windowEnd,
    ...aggregated,
  };

  memoryCorpusCache.set(cacheKey, { at: Date.now(), corpus });
  return corpus;
}

const loadWindowCorpusForAnchor = cache(async (anchorIso: string): Promise<WindowCorpus | null> => {
  const anchor = new Date(anchorIso);
  if (Number.isNaN(anchor.getTime())) return null;
  return fetchWindowCorpusAtAnchor(anchor);
});

/** Load aggregated 90-day window metrics (single-pass, no full review text in memory). */
export async function getWindowCorpus(
  sources: CorpusPayloadSources = {}
): Promise<WindowCorpus | null> {
  const anchor = await resolveAnalysisAnchorDate(sources);
  return loadWindowCorpusForAnchor(anchor.toISOString());
}

export function computeOpportunityScoreFromReviews(
  reviews: WindowReviewLite[],
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
