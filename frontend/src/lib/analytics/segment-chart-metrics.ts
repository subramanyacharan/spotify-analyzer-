import type {
  SegmentMatrixMetric,
  SegmentProfile,
  SegmentationLens,
} from "./types";

export type CohortChartView = "compare" | "all";

export function buildChartMetrics(
  profiles: SegmentProfile[],
  matrixMetrics: SegmentMatrixMetric[],
  lens: SegmentationLens
): SegmentMatrixMetric[] {
  if (!profiles.length) return [];

  if (lens === "behavior" && matrixMetrics.length) {
    const names = new Set(profiles.map((p) => p.name));
    return matrixMetrics.map((m) => ({
      ...m,
      values: Object.fromEntries(
        [...names].map((name) => [name, m.values[name] ?? 0])
      ),
    }));
  }

  const maxReviews = Math.max(...profiles.map((p) => p.reviewCount), 1);

  const row = (
    key: string,
    label: string,
    valueFn: (p: SegmentProfile) => number
  ): SegmentMatrixMetric => ({
    key,
    metric: label,
    values: Object.fromEntries(profiles.map((p) => [p.name, valueFn(p)])),
  });

  return [
    row("friction", "Friction index", (p) => Math.round(p.frictionScore * 100) / 100),
    row("satisfaction", "Satisfaction index", (p) =>
      Math.round((1 - p.negativePct / 100) * 100) / 100
    ),
    row("negative", "Negative feedback", (p) =>
      Math.round((p.negativePct / 100) * 100) / 100
    ),
    row("severity", "Issue severity", (p) =>
      Math.round((p.avgClusterSeverity / 5) * 100) / 100
    ),
    row("volume", "Review volume", (p) =>
      Math.round((p.reviewCount / maxReviews) * 100) / 100
    ),
  ];
}

export const COHORT_LINE_COLORS = [
  "#1db954",
  "#a1a1aa",
  "#60a5fa",
  "#f59e0b",
  "#f472b6",
  "#34d399",
  "#c084fc",
  "#fb7185",
];
