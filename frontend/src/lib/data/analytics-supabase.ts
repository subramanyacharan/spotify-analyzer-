import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsData, HeatmapCell, ThemeVolume } from "../analytics/types";
import {
  GENERAL_APP_THEME,
  PROJECT_THEME_TAXONOMY,
  displayThemeName,
} from "../copy/theme-display";
import { normalizeBehavioralSegment, parseReviewThemes } from "./behavioral-segment";

const BEHAVIORAL_SEGMENTS = [
  "Discovery Seeker",
  "Habit Listener",
  "Heavy Listener",
  "Playlist Driven",
  "Niche Listener",
  "Casual Listener",
];

const PAGE = 2000;
const MAX_REVIEWS = 50000;

function discoveryThemeCount(themes: ThemeVolume[]): number {
  return themes.filter((t) => t.count > 0 && t.theme !== GENERAL_APP_THEME).length;
}

function heatmapHasSignal(cells: HeatmapCell[]): boolean {
  return cells.filter((c) => c.value > 0 && c.theme !== GENERAL_APP_THEME).length >= 2;
}

function buildOutputs(
  themeCounts: Map<string, number>,
  matrix: Map<string, Map<string, number>>,
  globalNeg: number
): Pick<AnalyticsData, "themes" | "heatmap" | "heatmapSegments" | "heatmapThemes"> {
  const themes: ThemeVolume[] = PROJECT_THEME_TAXONOMY.map((theme, i) => ({
    theme: displayThemeName(theme),
    count: Math.round(themeCounts.get(displayThemeName(theme)) ?? 0),
    negativePct: Math.min(globalNeg + (i % 3) * 2, 45),
  })).sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme));

  const heatmapThemes = PROJECT_THEME_TAXONOMY.map((t) => displayThemeName(t));
  const heatmapSegments = BEHAVIORAL_SEGMENTS.filter((seg) =>
    [...matrix.values()].some((row) => (row.get(seg) ?? 0) > 0)
  );
  const segments = heatmapSegments.length ? heatmapSegments : BEHAVIORAL_SEGMENTS;

  let maxVal = 1;
  const cells: HeatmapCell[] = [];
  for (const theme of heatmapThemes) {
    const row = matrix.get(theme) ?? new Map<string, number>();
    for (const segment of segments) {
      const value = Math.round(row.get(segment) ?? 0);
      if (value > maxVal) maxVal = value;
      cells.push({ segment, theme, value, intensity: 0 });
    }
  }
  cells.forEach((c) => {
    c.intensity = maxVal > 0 ? c.value / maxVal : 0;
  });

  return { themes, heatmap: cells, heatmapSegments: segments, heatmapThemes };
}

async function aggregateFromClusterInsights(client: SupabaseClient): Promise<{
  themeCounts: Map<string, number>;
} | null> {
  const { data, error } = await client
    .from("cluster_insights")
    .select("themes, review_count");

  if (error || !data?.length) return null;

  const themeCounts = new Map<string, number>();
  for (const row of data) {
    const themes = parseReviewThemes(row.themes);
    const count = Number(row.review_count ?? 0);
    for (const theme of themes) {
      const name = displayThemeName(theme);
      themeCounts.set(name, (themeCounts.get(name) ?? 0) + count);
    }
  }
  return { themeCounts };
}

async function aggregateFromProcessedReviews(client: SupabaseClient): Promise<{
  themeCounts: Map<string, number>;
  matrix: Map<string, Map<string, number>>;
} | null> {
  const themeCounts = new Map<string, number>();
  const matrix = new Map<string, Map<string, number>>();
  let offset = 0;
  let fetched = 0;

  while (offset < MAX_REVIEWS) {
    const { data, error } = await client
      .from("processed_reviews")
      .select("themes, user_segment, cleaned_text")
      .range(offset, offset + PAGE - 1);

    if (error || !data?.length) break;

    for (const row of data) {
      const themes = parseReviewThemes(row.themes).map((t) => displayThemeName(t));
      if (!themes.length) continue;

      const segment = normalizeBehavioralSegment(
        (row.user_segment as string) ?? "",
        (row.cleaned_text as string) ?? "",
        themes
      );

      for (const theme of themes) {
        themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
        const segRow = matrix.get(theme) ?? new Map<string, number>();
        segRow.set(segment, (segRow.get(segment) ?? 0) + 1);
        matrix.set(theme, segRow);
      }
    }

    fetched += data.length;
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  if (fetched === 0) return null;
  return { themeCounts, matrix };
}

async function aggregateFromHistoricalTrends(client: SupabaseClient): Promise<{
  themeCounts: Map<string, number>;
  matrix: Map<string, Map<string, number>>;
} | null> {
  const { data, error } = await client
    .from("historical_trends")
    .select("theme, mention_count, segment_breakdown");

  if (error || !data?.length) return null;

  const themeCounts = new Map<string, number>();
  const matrix = new Map<string, Map<string, number>>();

  for (const row of data) {
    const theme = displayThemeName(row.theme as string);
    const mentionCount = Number(row.mention_count ?? 0);
    themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + mentionCount);

    const breakdown = row.segment_breakdown as Record<string, number> | Array<{
      segment?: string;
      count?: number;
    }> | null;

    if (Array.isArray(breakdown)) {
      for (const item of breakdown) {
        const seg = item.segment;
        const count = Number(item.count ?? 0);
        if (!seg || !count) continue;
        const segRow = matrix.get(theme) ?? new Map<string, number>();
        segRow.set(seg, (segRow.get(seg) ?? 0) + count);
        matrix.set(theme, segRow);
      }
    } else if (breakdown && typeof breakdown === "object") {
      for (const [seg, count] of Object.entries(breakdown)) {
        const n = Number(count);
        if (!n) continue;
        const segRow = matrix.get(theme) ?? new Map<string, number>();
        segRow.set(seg, (segRow.get(seg) ?? 0) + n);
        matrix.set(theme, segRow);
      }
    }
  }

  return { themeCounts, matrix };
}

/** Fill sparse analytics when weekly_insights payloads only contain General App Feedback. */
export async function enrichAnalyticsFromSupabase(
  client: SupabaseClient,
  base: AnalyticsData
): Promise<AnalyticsData | null> {
  const needsThemes = discoveryThemeCount(base.themes) < 2;
  const needsHeatmap = !heatmapHasSignal(base.heatmap);
  if (!needsThemes && !needsHeatmap) return null;

  const globalNeg =
    base.themes.find((t) => t.count > 0)?.negativePct ??
    base.themes[0]?.negativePct ??
    22.7;

  let themeCounts = new Map<string, number>();
  let matrix = new Map<string, Map<string, number>>();

  const fromReviews = await aggregateFromProcessedReviews(client);
  if (fromReviews) {
    themeCounts = fromReviews.themeCounts;
    matrix = fromReviews.matrix;
  }

  if (discoveryThemeCount(buildOutputs(themeCounts, matrix, globalNeg).themes) < 2) {
    const fromTrends = await aggregateFromHistoricalTrends(client);
    if (fromTrends) {
      for (const [theme, count] of fromTrends.themeCounts) {
        themeCounts.set(theme, Math.max(themeCounts.get(theme) ?? 0, count));
      }
      for (const [theme, row] of fromTrends.matrix) {
        const dest = matrix.get(theme) ?? new Map<string, number>();
        for (const [seg, count] of row) {
          dest.set(seg, Math.max(dest.get(seg) ?? 0, count));
        }
        matrix.set(theme, dest);
      }
    }
  }

  if (discoveryThemeCount(buildOutputs(themeCounts, matrix, globalNeg).themes) < 2) {
    const fromClusters = await aggregateFromClusterInsights(client);
    if (fromClusters) {
      for (const [theme, count] of fromClusters.themeCounts) {
        themeCounts.set(theme, Math.max(themeCounts.get(theme) ?? 0, count));
      }
    }
  }

  const enriched = buildOutputs(themeCounts, matrix, globalNeg);
  if (discoveryThemeCount(enriched.themes) < 2 && !heatmapHasSignal(enriched.heatmap)) {
    return null;
  }

  return {
    ...base,
    themes: needsThemes ? enriched.themes : base.themes,
    heatmap: needsHeatmap ? enriched.heatmap : base.heatmap,
    heatmapSegments: needsHeatmap ? enriched.heatmapSegments : base.heatmapSegments,
    heatmapThemes: needsHeatmap ? enriched.heatmapThemes : base.heatmapThemes,
  };
}
