export interface OpportunityScores {
  frequency: number;
  severity: number;
  segmentImpact: number;
  sentimentIntensity: number;
  composite: number;
}

export interface OpportunityItem {
  id: string;
  clusterId: number;
  rank: number;
  tier: string;
  painPoint: string;
  productOpportunity: string;
  featureRequest: string;
  themes: string[];
  reviewCount: number;
  scores: OpportunityScores;
  segments: { segment: string; count: number; pct: number }[];
  themeBreakdown: { theme: string; count: number; pct: number }[];
  quotes: string[];
  dominantSentiment: string;
}

export interface OpportunitiesData {
  generatedAt: string;
  totalReviews: number;
  scoringFormula: string;
  opportunities: OpportunityItem[];
  dataSource: "supabase" | "local";
}

export type PrioritizationType =
  | "pain_point"
  | "segment_friction"
  | "opportunity"
  | "emerging_issue";

export interface PrioritizationItem {
  rank: number;
  type: PrioritizationType;
  typeLabel: string;
  title: string;
  tier: "Critical" | "High" | "Monitor";
  priorityScore: number;
  recommendation: string;
  evidence: Record<string, unknown>;
}

export interface PrioritizationData {
  generatedAt: string;
  totalReviews: number;
  tierSummary: Record<string, number>;
  items: PrioritizationItem[];
  topPriority: PrioritizationItem | null;
  dataSource: "supabase" | "local";
}

export const TYPE_LABELS: Record<PrioritizationType, string> = {
  pain_point: "Pain point",
  segment_friction: "Segment friction",
  opportunity: "Product bet",
  emerging_issue: "Emerging issue",
};

export const TIER_STYLES: Record<string, string> = {
  Critical: "bg-red-500/15 text-red-400 border-red-500/30",
  High: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Monitor: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};
