export type SegmentationLens =
  | "business"
  | "engagement"
  | "behavior"
  | "context"
  | "pain";

export type ConfidenceLevel = "High" | "Medium" | "Low";

export interface ConfidenceInput {
  reviewCount: number;
  avgClusterSeverity?: number;
  negativePct?: number;
  quoteCount?: number;
  hasClusterInsight?: boolean;
}

export interface SegmentFriction {
  segment: string;
  reviewCount: number;
  frictionScore: number;
  negativePct: number;
}

export interface TopOpportunity {
  rank: number;
  tier: string;
  painPoint: string;
  compositeScore: number;
  reviewCount: number;
  quotes: string[];
}

export interface OverviewData {
  generatedAt: string;
  totalReviews: number;
  dominantThemes: { theme: string; count: number }[];
  sentimentTrend: {
    positive: number;
    neutral: number;
    negative: number;
    negativePct: number;
  };
  topFrictionByLens: Record<SegmentationLens, SegmentFriction | null>;
  topOpportunity: TopOpportunity | null;
  executiveSummary: {
    text: string;
    tier: string;
    quotes: string[];
    reviewCount: number;
    avgSeverity?: number;
  };
  dataSource: "supabase" | "local";
}
