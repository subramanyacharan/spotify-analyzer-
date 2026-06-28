import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsData, ThemeVolume } from "../analytics/types";
import {
  GENERAL_APP_THEME,
  PROJECT_THEME_TAXONOMY,
  displayThemeName,
} from "../copy/theme-display";
import {
  type HeatmapMatrix,
  bumpMatrixCell,
  emptyHeatmapMatrix,
  heatmapCellsToMatrix,
  matrixToHeatmapCells,
  mergeHeatmapMatrixMax,
} from "./analytics-heatmap";
import { normalizeBehavioralSegment, parseReviewThemes } from "./behavioral-segment";

const PAGE = 4000;
const MAX_REVIEWS = 160000;

function discoveryThemeCount(themes: ThemeVolume[]): number {
  return themes.filter((t) => t.count > 0 && t.theme !== GENERAL_APP_THEME).length;
}

function themeCountsFromMatrix(matrix: HeatmapMatrix): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [theme, row] of matrix) {
    let sum = 0;
    for (const value of row.values()) sum += value;
    if (sum > 0) counts.set(theme, Math.round(sum));
  }
  return counts;
}

function buildThemeVolumes(
  themeCounts: Map<string, number>,
  globalNeg: number
): ThemeVolume[] {
  return PROJECT_THEME_TAXONOMY.map((theme, i) => ({
    theme: displayThemeName(theme),
    count: Math.round(themeCounts.get(displayThemeName(theme)) ?? 0),
    negativePct: Math.min(globalNeg + (i % 3) * 2, 45),
  })).sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme));
}

function applyMatrixToAnalytics(
  base: AnalyticsData,
  matrix: HeatmapMatrix,
  globalNeg: number,
  mergeThemes: boolean
): AnalyticsData {
  const heatmap = matrixToHeatmapCells(matrix);
  const themeCounts = themeCountsFromMatrix(matrix);
  const themes = buildThemeVolumes(
    mergeThemes
      ? new Map(
          PROJECT_THEME_TAXONOMY.map((t) => {
            const name = displayThemeName(t);
            return [
              name,
              Math.max(
                themeCounts.get(name) ?? 0,
                base.themes.find((x) => x.theme === name)?.count ?? 0
              ),
            ] as const;
          })
        )
      : themeCounts,
    globalNeg
  );

  return {
    ...base,
    themes: mergeThemes ? themes : base.themes,
    heatmap: heatmap.cells,
    heatmapSegments: heatmap.segments,
    heatmapThemes: heatmap.themes,
  };
}

async function aggregateFromClusterInsights(
  client: SupabaseClient
): Promise<HeatmapMatrix | null> {
  const { data: clusters, error } = await client
    .from("cluster_insights")
    .select("cluster_id, themes, review_count");

  if (error || !clusters?.length) return null;

  const matrix = emptyHeatmapMatrix();

  for (const cluster of clusters) {
    const clusterId = cluster.cluster_id as number;
    const clusterThemes = parseReviewThemes(cluster.themes).map((t) => displayThemeName(t));
    if (!clusterThemes.length) continue;

    const segCounts = new Map<string, number>();
    let offset = 0;

    while (true) {
      const { data: rows, error: rowError } = await client
        .from("processed_reviews")
        .select("user_segment, cleaned_text, themes")
        .eq("cluster_id", clusterId)
        .range(offset, offset + PAGE - 1);

      if (rowError || !rows?.length) break;

      for (const row of rows) {
        const themes = parseReviewThemes(row.themes).map((t) => displayThemeName(t));
        const segment = normalizeBehavioralSegment(
          (row.user_segment as string) ?? "",
          (row.cleaned_text as string) ?? "",
          themes.length ? themes : clusterThemes
        );
        segCounts.set(segment, (segCounts.get(segment) ?? 0) + 1);
      }

      if (rows.length < PAGE) break;
      offset += PAGE;
    }

    if (segCounts.size === 0) {
      const fallbackCount = Number(cluster.review_count ?? 0);
      if (fallbackCount > 0) {
        for (const theme of clusterThemes) {
          bumpMatrixCell(matrix, theme, "Casual Listener", fallbackCount);
        }
      }
      continue;
    }

    for (const theme of clusterThemes) {
      for (const [segment, count] of segCounts) {
        bumpMatrixCell(matrix, theme, segment, count);
      }
    }
  }

  return matrix.size > 0 ? matrix : null;
}

async function aggregateFromProcessedReviews(
  client: SupabaseClient
): Promise<HeatmapMatrix | null> {
  const matrix = emptyHeatmapMatrix();
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
        bumpMatrixCell(matrix, theme, segment, 1);
      }
    }

    fetched += data.length;
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return fetched > 0 ? matrix : null;
}

async function aggregateFromHistoricalTrends(
  client: SupabaseClient
): Promise<HeatmapMatrix | null> {
  const { data, error } = await client
    .from("historical_trends")
    .select("theme, mention_count, segment_breakdown");

  if (error || !data?.length) return null;

  const matrix = emptyHeatmapMatrix();

  for (const row of data) {
    const theme = displayThemeName(row.theme as string);
    const breakdown = row.segment_breakdown as Record<string, number> | Array<{
      segment?: string;
      count?: number;
    }> | null;

    if (Array.isArray(breakdown)) {
      for (const item of breakdown) {
        const seg = item.segment;
        const count = Number(item.count ?? 0);
        if (seg && count > 0) bumpMatrixCell(matrix, theme, seg, count);
      }
    } else if (breakdown && typeof breakdown === "object") {
      for (const [seg, count] of Object.entries(breakdown)) {
        const n = Number(count);
        if (n > 0) bumpMatrixCell(matrix, theme, seg, n);
      }
    } else {
      const mentionCount = Number(row.mention_count ?? 0);
      if (mentionCount > 0) {
        bumpMatrixCell(matrix, theme, "Casual Listener", mentionCount);
      }
    }
  }

  return matrix.size > 0 ? matrix : null;
}

/** Merge live Supabase review data into analytics heatmap + theme charts. */
export async function enrichAnalyticsFromSupabase(
  client: SupabaseClient,
  base: AnalyticsData
): Promise<AnalyticsData> {
  const globalNeg =
    base.themes.find((t) => t.count > 0)?.negativePct ??
    base.themes[0]?.negativePct ??
    22.7;

  let matrix = heatmapCellsToMatrix(base.heatmap);

  const fromClusters = await aggregateFromClusterInsights(client);
  if (fromClusters) mergeHeatmapMatrixMax(matrix, fromClusters);

  const fromReviews = await aggregateFromProcessedReviews(client);
  if (fromReviews) mergeHeatmapMatrixMax(matrix, fromReviews);

  const fromTrends = await aggregateFromHistoricalTrends(client);
  if (fromTrends) mergeHeatmapMatrixMax(matrix, fromTrends);

  const needsThemes = discoveryThemeCount(base.themes) < 2;
  const hasHeatmapData = [...matrix.values()].some((row) =>
    [...row.values()].some((v) => v > 0)
  );

  if (!hasHeatmapData && !needsThemes) return base;

  return applyMatrixToAnalytics(base, matrix, globalNeg, needsThemes || hasHeatmapData);
}
