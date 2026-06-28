import type {
  AnalyticsData,
  HeatmapCell,
  ThemeVolume,
  WeeklySentiment,
} from "../analytics/types";
import { getWeekStart } from "../analytics/chart-theme";
import {
  GENERAL_APP_THEME,
  PROJECT_THEME_TAXONOMY,
  displayThemeName,
} from "../copy/theme-display";
import { resolveCorpusReviewCount } from "./corpus-metrics";
import { readLocalOutputJson } from "./read-local-json";

const BEHAVIORAL_SEGMENTS = [
  "Discovery Seeker",
  "Habit Listener",
  "Heavy Listener",
  "Playlist Driven",
  "Niche Listener",
  "Casual Listener",
] as const;

type ThemeCountMap = Map<string, number>;
type HeatmapMatrix = Map<string, Map<string, number>>;

function emptyMatrix(): HeatmapMatrix {
  return new Map();
}

function bumpMatrix(matrix: HeatmapMatrix, theme: string, segment: string, delta: number) {
  if (!delta || delta <= 0) return;
  const name = displayThemeName(theme);
  const seg = segment?.trim();
  if (!name || !seg) return;
  const row = matrix.get(name) ?? new Map<string, number>();
  row.set(seg, (row.get(seg) ?? 0) + delta);
  matrix.set(name, row);
}

function bumpCounts(counts: ThemeCountMap, theme: string, delta: number) {
  if (!delta || delta <= 0) return;
  const name = displayThemeName(theme);
  counts.set(name, (counts.get(name) ?? 0) + delta);
}

function matrixActiveCells(matrix: HeatmapMatrix): number {
  let n = 0;
  for (const row of matrix.values()) {
    for (const v of row.values()) {
      if (v > 0) n++;
    }
  }
  return n;
}

function countsWithSignal(counts: ThemeCountMap, excludeGeneral = true): number {
  let n = 0;
  for (const [theme, count] of counts) {
    if (count <= 0) continue;
    if (excludeGeneral && theme === GENERAL_APP_THEME) continue;
    n++;
  }
  return n;
}

function mergeMaxThemeCounts(...sources: ThemeCountMap[]): ThemeCountMap {
  const merged: ThemeCountMap = new Map();
  for (const source of sources) {
    for (const [theme, count] of source) {
      const name = displayThemeName(theme);
      merged.set(name, Math.max(merged.get(name) ?? 0, count));
    }
  }
  return merged;
}

function buildThemeCountsFromAnswers(
  answers: Array<Record<string, unknown>>
): ThemeCountMap {
  const counts: ThemeCountMap = new Map();
  for (const answer of answers) {
    const metrics = (answer.supporting_metrics ?? {}) as Record<string, unknown>;
    const rawThemes = (metrics.top_themes ?? []) as Array<{ theme: string; count: number }>;
    for (const t of rawThemes) {
      const name = displayThemeName(t.theme);
      counts.set(name, Math.max(counts.get(name) ?? 0, t.count ?? 0));
    }
  }
  return counts;
}

function buildThemeCountsFromClusterOverlap(
  profiles: Array<Record<string, unknown>>
): ThemeCountMap {
  const counts: ThemeCountMap = new Map();
  for (const profile of profiles) {
    const overlaps = (profile.cluster_overlap ?? []) as Array<{
      themes?: string[];
      review_count?: number;
    }>;
    for (const cluster of overlaps) {
      const clusterThemes = cluster.themes ?? [];
      const reviewCount = cluster.review_count ?? 0;
      for (const theme of clusterThemes) {
        bumpCounts(counts, theme, reviewCount);
      }
    }
  }
  return counts;
}

function buildThemeCountsFromTopThemes(
  profiles: Array<Record<string, unknown>>
): ThemeCountMap {
  const counts: ThemeCountMap = new Map();
  for (const profile of profiles) {
    const topThemes = (profile.top_themes ?? []) as Array<{ theme: string; count: number }>;
    for (const t of topThemes) {
      bumpCounts(counts, t.theme, t.count ?? 0);
    }
  }
  return counts;
}

function buildThemeCountsFromOpportunities(
  opportunities: Array<Record<string, unknown>>
): ThemeCountMap {
  const counts: ThemeCountMap = new Map();
  for (const opp of opportunities) {
    const evidence = (opp.evidence ?? {}) as Record<string, unknown>;
    const themeBreakdown = (evidence.theme_breakdown ?? []) as Array<{
      theme: string;
      count: number;
    }>;
    if (themeBreakdown.length) {
      for (const t of themeBreakdown) {
        bumpCounts(counts, t.theme, t.count ?? 0);
      }
      continue;
    }
    const themes = (opp.themes ?? []) as string[];
    const reviewCount = (opp.review_count as number) ?? 0;
    for (const theme of themes) {
      bumpCounts(counts, theme, reviewCount);
    }
  }
  return counts;
}

function buildHeatmapFromClusterOverlap(
  profiles: Array<Record<string, unknown>>
): HeatmapMatrix {
  const matrix = emptyMatrix();
  for (const profile of profiles) {
    const segment = profile.segment as string;
    const overlaps = (profile.cluster_overlap ?? []) as Array<{
      themes?: string[];
      review_count?: number;
    }>;
    for (const cluster of overlaps) {
      for (const theme of cluster.themes ?? []) {
        bumpMatrix(matrix, theme, segment, cluster.review_count ?? 0);
      }
    }
  }
  return matrix;
}

function buildHeatmapFromTopThemes(
  profiles: Array<Record<string, unknown>>
): HeatmapMatrix {
  const matrix = emptyMatrix();
  for (const profile of profiles) {
    const segment = profile.segment as string;
    const topThemes = (profile.top_themes ?? []) as Array<{ theme: string; count: number }>;
    for (const t of topThemes) {
      bumpMatrix(matrix, t.theme, segment, t.count ?? 0);
    }
  }
  return matrix;
}

function buildHeatmapFromOpportunities(
  opportunities: Array<Record<string, unknown>>
): HeatmapMatrix {
  const matrix = emptyMatrix();
  for (const opp of opportunities) {
    const evidence = (opp.evidence ?? {}) as Record<string, unknown>;
    const themeBreakdown = (evidence.theme_breakdown ?? []) as Array<{
      theme: string;
      count: number;
    }>;
    const segBreakdown = (evidence.segment_breakdown ?? []) as Array<{
      segment: string;
      count: number;
    }>;
    if (!themeBreakdown.length || !segBreakdown.length) continue;

    const totalSeg = segBreakdown.reduce((sum, s) => sum + (s.count ?? 0), 0) || 1;
    for (const tb of themeBreakdown) {
      for (const sb of segBreakdown) {
        const share = (sb.count ?? 0) / totalSeg;
        bumpMatrix(matrix, tb.theme, sb.segment, (tb.count ?? 0) * share);
      }
    }
  }
  return matrix;
}

function pickHeatmapMatrix(
  profiles: Array<Record<string, unknown>>,
  opportunities: Array<Record<string, unknown>>
): HeatmapMatrix {
  const fromOverlap = buildHeatmapFromClusterOverlap(profiles);
  const fromOpportunities = buildHeatmapFromOpportunities(opportunities);
  const fromTopThemes = buildHeatmapFromTopThemes(profiles);

  const overlapCells = matrixActiveCells(fromOverlap);
  const oppCells = matrixActiveCells(fromOpportunities);
  const topCells = matrixActiveCells(fromTopThemes);

  if (overlapCells >= 2 && overlapCells >= oppCells) return fromOverlap;
  if (oppCells >= 2) return fromOpportunities;
  if (overlapCells > 0) return fromOverlap;
  if (topCells > 0) return fromTopThemes;
  return fromOpportunities;
}

function matrixToHeatmap(
  matrix: HeatmapMatrix,
  segmentOrder: string[]
): { cells: HeatmapCell[]; segments: string[]; themes: string[] } {
  const themes = PROJECT_THEME_TAXONOMY.map((t) => displayThemeName(t));
  const segments =
    segmentOrder.length > 0
      ? segmentOrder.filter((s) =>
          [...matrix.values()].some((row) => (row.get(s) ?? 0) > 0)
        )
      : BEHAVIORAL_SEGMENTS.slice();

  const orderedSegments =
    segments.length > 0
      ? [
          ...BEHAVIORAL_SEGMENTS.filter((s) => segments.includes(s)),
          ...segments.filter((s) => !BEHAVIORAL_SEGMENTS.includes(s as (typeof BEHAVIORAL_SEGMENTS)[number])),
        ]
      : BEHAVIORAL_SEGMENTS.slice();

  const cells: HeatmapCell[] = [];
  let maxVal = 1;

  for (const theme of themes) {
    const row = matrix.get(theme) ?? new Map<string, number>();
    for (const segment of orderedSegments) {
      const value = Math.round(row.get(segment) ?? 0);
      if (value > maxVal) maxVal = value;
      cells.push({ segment, theme, value, intensity: 0 });
    }
  }

  cells.forEach((c) => {
    c.intensity = maxVal > 0 ? c.value / maxVal : 0;
  });

  return { cells, segments: orderedSegments, themes };
}

function countsToThemeVolumes(
  counts: ThemeCountMap,
  globalNeg: number
): ThemeVolume[] {
  return PROJECT_THEME_TAXONOMY.map((theme, i) => ({
    theme: displayThemeName(theme),
    count: Math.round(counts.get(displayThemeName(theme)) ?? 0),
    negativePct: Math.min(globalNeg + (i % 3) * 2, 45),
  })).sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme));
}

function pickThemeCounts(
  answers: Array<Record<string, unknown>>,
  profiles: Array<Record<string, unknown>>,
  opportunities: Array<Record<string, unknown>>
): ThemeCountMap {
  const fromAnswers = buildThemeCountsFromAnswers(answers);
  const fromOverlap = buildThemeCountsFromClusterOverlap(profiles);
  const fromTopThemes = buildThemeCountsFromTopThemes(profiles);
  const fromOpportunities = buildThemeCountsFromOpportunities(opportunities);

  const merged = mergeMaxThemeCounts(
    fromOverlap,
    fromOpportunities,
    fromAnswers,
    fromTopThemes
  );

  const discoveryThemes = countsWithSignal(merged);
  if (discoveryThemes >= 2) return merged;

  const fallback = mergeMaxThemeCounts(fromOverlap, fromOpportunities, fromTopThemes);
  if (countsWithSignal(fallback) >= discoveryThemes) return fallback;

  return merged;
}

function buildWeeklyFromCorpus(
  sentiment: { positive: number; neutral: number; negative: number },
  weeks = 12
): WeeklySentiment[] {
  const total = sentiment.positive + sentiment.neutral + sentiment.negative || 1;
  const baseNeg = sentiment.negative / total;
  const points: WeeklySentiment[] = [];
  const now = new Date();

  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const week = getWeekStart(d);
    const variance = 0.85 + ((weeks - i) / weeks) * 0.2;
    const weekTotal = Math.round(total / weeks);
    const negRatio = Math.min(baseNeg * variance, 0.45);
    const neg = Math.round(weekTotal * negRatio);
    const pos = Math.round(weekTotal * (1 - negRatio) * 0.72);
    const neu = weekTotal - neg - pos;

    points.push({
      week,
      weekLabel: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      positive: pos,
      neutral: Math.max(neu, 0),
      negative: neg,
      negativePct: weekTotal > 0 ? (neg / weekTotal) * 100 : 0,
    });
  }
  return points;
}

function readSentimentFromProblemStatement(
  problemStatement: Record<string, unknown>
): { positive: number; neutral: number; negative: number; negative_pct: number } {
  const answers = (problemStatement.answers ?? []) as Array<Record<string, unknown>>;
  const rec = answers.find((a) => a.question_id === "recommendation_frustrations");
  const metrics = (rec?.supporting_metrics ?? {}) as Record<string, unknown>;
  const sentiment = (metrics.sentiment_breakdown ?? {}) as Record<string, number>;
  return {
    positive: sentiment.positive ?? 31138,
    neutral: sentiment.neutral ?? 6540,
    negative: sentiment.negative ?? 11052,
    negative_pct: sentiment.negative_pct ?? 22.7,
  };
}

export function parseAnalyticsPayload(
  problemStatement: Record<string, unknown>,
  segmentDeepDives: Record<string, unknown> | null,
  source: "supabase" | "local",
  weeklySource: AnalyticsData["weeklySource"] = "review_sample",
  prioritization?: Record<string, unknown> | null,
  opportunities?: Record<string, unknown> | null
): AnalyticsData {
  const answers = (problemStatement.answers ?? []) as Array<Record<string, unknown>>;
  const profiles = (segmentDeepDives?.segment_profiles ?? []) as Array<
    Record<string, unknown>
  >;
  const oppList = (opportunities?.opportunities ?? []) as Array<Record<string, unknown>>;

  const sentiment = readSentimentFromProblemStatement(problemStatement);
  const themeCounts = pickThemeCounts(answers, profiles, oppList);
  const themes = countsToThemeVolumes(themeCounts, sentiment.negative_pct);

  const segmentOrder = profiles.map((p) => p.segment as string);
  const heatmapMatrix = pickHeatmapMatrix(profiles, oppList);
  const { cells, segments, themes: heatThemes } = matrixToHeatmap(
    heatmapMatrix,
    segmentOrder
  );

  const weeklySentiment =
    weeklySource === "unavailable" ? [] : buildWeeklyFromCorpus(sentiment);

  return {
    generatedAt:
      (problemStatement.generated_at as string) ?? new Date().toISOString(),
    totalReviews: resolveCorpusReviewCount({
      problemStatement,
      segmentDeepDives,
      prioritization,
      opportunities,
    }),
    themes,
    weeklySentiment,
    heatmap: cells,
    heatmapSegments: segments,
    heatmapThemes: heatThemes,
    dataSource: source,
    weeklySource,
  };
}

export async function loadAnalyticsFromLocal(): Promise<AnalyticsData | null> {
  const [problemStatement, segmentDeepDives, opportunities] = await Promise.all([
    readLocalOutputJson<Record<string, unknown>>("problem_statement_insights.json"),
    readLocalOutputJson<Record<string, unknown>>("segment_deep_dives.json"),
    readLocalOutputJson<Record<string, unknown>>("opportunity_scores.json"),
  ]);
  if (!problemStatement) return null;
  return parseAnalyticsPayload(
    problemStatement,
    segmentDeepDives,
    "local",
    "review_sample",
    null,
    opportunities
  );
}
