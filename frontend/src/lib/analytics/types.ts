export interface ThemeVolume {
  theme: string;
  count: number;
  negativePct: number;
}

export interface WeeklySentiment {
  week: string;
  weekLabel: string;
  positive: number;
  neutral: number;
  negative: number;
  negativePct: number;
}

export interface HeatmapCell {
  segment: string;
  theme: string;
  value: number;
  intensity: number;
}

export interface AnalyticsData {
  generatedAt: string;
  totalReviews: number;
  themes: ThemeVolume[];
  weeklySentiment: WeeklySentiment[];
  heatmap: HeatmapCell[];
  heatmapSegments: string[];
  heatmapThemes: string[];
  dataSource: "supabase" | "local";
  weeklySource: "historical_trends" | "review_sample" | "unavailable";
}

export type SegmentationLens =
  | "business"
  | "engagement"
  | "behavior"
  | "context"
  | "pain";

export interface SegmentProfile {
  id: string;
  name: string;
  lens: SegmentationLens;
  reviewCount: number;
  negativePct: number;
  frictionScore: number;
  avgClusterSeverity: number;
  topThemes: { theme: string; count: number; pct: number }[];
  topPainPoints: { painPoint: string; count: number; pct: number }[];
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
    negativePct: number;
    avgScore?: number;
  };
  listeningIntent?: {
    dominant: string;
    discoveryPct: number;
    comfortPct: number;
    moodPct: number;
  };
  quotes: string[];
  profileSummary: string;
  clusterOverlap: {
    clusterId: number;
    reviewCount: number;
    pct: number;
    painPoint: string;
    severity: number;
  }[];
}

export interface SegmentMatrixMetric {
  metric: string;
  key: string;
  values: Record<string, number>;
}

export interface SegmentsData {
  generatedAt: string;
  totalReviews: number;
  profilesByLens: Record<SegmentationLens, SegmentProfile[]>;
  matrixMetrics: SegmentMatrixMetric[];
  highestFrictionSegment: string;
  varianceDeltaPct: number;
  subClusters: {
    name: string;
    reviewCount: number;
    frictionScore: number;
    negativePct: number;
    growthTrendPct: number;
    churnRisk: "LOW" | "MEDIUM" | "HIGH";
    lens: SegmentationLens;
  }[];
  dataSource: "supabase" | "local";
}
