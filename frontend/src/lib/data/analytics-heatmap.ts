/** Shared heatmap grid utilities for analytics data loaders. */

import type { HeatmapCell } from "../analytics/types";
import { PROJECT_THEME_TAXONOMY, displayThemeName } from "../copy/theme-display";

export const BEHAVIORAL_SEGMENTS = [
  "Discovery Seeker",
  "Habit Listener",
  "Heavy Listener",
  "Playlist Driven",
  "Niche Listener",
  "Casual Listener",
] as const;

export type HeatmapMatrix = Map<string, Map<string, number>>;

export function emptyHeatmapMatrix(): HeatmapMatrix {
  return new Map();
}

export function setMatrixCell(
  matrix: HeatmapMatrix,
  theme: string,
  segment: string,
  value: number
) {
  const name = displayThemeName(theme);
  const seg = segment?.trim();
  if (!name || !seg || value < 0) return;
  const row = matrix.get(name) ?? new Map<string, number>();
  row.set(seg, value);
  matrix.set(name, row);
}

export function bumpMatrixCell(
  matrix: HeatmapMatrix,
  theme: string,
  segment: string,
  delta: number
) {
  if (!delta || delta <= 0) return;
  const name = displayThemeName(theme);
  const seg = segment?.trim();
  if (!name || !seg) return;
  const row = matrix.get(name) ?? new Map<string, number>();
  row.set(seg, (row.get(seg) ?? 0) + delta);
  matrix.set(name, row);
}

/** Keep the highest value per theme × segment cell. */
export function mergeHeatmapMatrixMax(
  target: HeatmapMatrix,
  source: HeatmapMatrix
): HeatmapMatrix {
  for (const [theme, row] of source) {
    for (const [segment, value] of row) {
      const name = displayThemeName(theme);
      const current = target.get(name)?.get(segment) ?? 0;
      if (value > current) {
        setMatrixCell(target, name, segment, value);
      }
    }
  }
  return target;
}

export function mergeHeatmapMatricesMax(...sources: HeatmapMatrix[]): HeatmapMatrix {
  const merged = emptyHeatmapMatrix();
  for (const source of sources) {
    mergeHeatmapMatrixMax(merged, source);
  }
  return merged;
}

export function heatmapCellsToMatrix(cells: HeatmapCell[]): HeatmapMatrix {
  const matrix = emptyHeatmapMatrix();
  for (const cell of cells) {
    setMatrixCell(matrix, cell.theme, cell.segment, cell.value);
  }
  return matrix;
}

/** Full taxonomy × all behavioral segments — zeros included. */
export function matrixToHeatmapCells(matrix: HeatmapMatrix): {
  cells: HeatmapCell[];
  segments: string[];
  themes: string[];
} {
  const themes = PROJECT_THEME_TAXONOMY.map((t) => displayThemeName(t));
  const segments = [...BEHAVIORAL_SEGMENTS];

  const cells: HeatmapCell[] = [];
  let maxVal = 0;

  for (const theme of themes) {
    const row = matrix.get(theme) ?? new Map<string, number>();
    for (const segment of segments) {
      const value = Math.round(row.get(segment) ?? 0);
      if (value > maxVal) maxVal = value;
      cells.push({ segment, theme, value, intensity: 0 });
    }
  }

  const scaleMax = maxVal > 0 ? maxVal : 1;
  cells.forEach((c) => {
    c.intensity = c.value / scaleMax;
  });

  return { cells, segments, themes };
}

export function formatHeatmapCount(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (value >= 1000) {
    const k = value / 1000;
    return k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(value);
}

export function buildHeatmapFromProblemAnswers(
  answers: Array<Record<string, unknown>>
): HeatmapMatrix {
  const matrix = emptyHeatmapMatrix();

  for (const answer of answers) {
    const metrics = (answer.supporting_metrics ?? {}) as Record<string, unknown>;
    const topThemes = (metrics.top_themes ?? []) as Array<{ theme: string; count: number }>;
    const segBreakdown = (metrics.segment_breakdown ?? []) as Array<{
      segment: string;
      count: number;
    }>;
    const totalSeg = segBreakdown.reduce((sum, s) => sum + (s.count ?? 0), 0);
    if (!totalSeg || !topThemes.length) continue;

    for (const tb of topThemes) {
      for (const sb of segBreakdown) {
        const allocated = (tb.count ?? 0) * ((sb.count ?? 0) / totalSeg);
        bumpMatrixCell(matrix, tb.theme, sb.segment, allocated);
      }
    }
  }

  return matrix;
}
