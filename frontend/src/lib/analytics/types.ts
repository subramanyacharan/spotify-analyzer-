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
