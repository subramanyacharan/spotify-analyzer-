export type InsightTopicId =
  | "discovery_struggle"
  | "recommendation_frustrations"
  | "listening_behaviors"
  | "repetitive_listening"
  | "segment_discovery_challenges"
  | "unmet_needs";

export interface InsightTopicMeta {
  id: InsightTopicId;
  /** User-facing label — never show raw question text */
  label: string;
  shortLabel: string;
  description: string;
  filterGroup: "discovery" | "recommendations" | "behavior" | "audience" | "opportunities";
}

export const INSIGHT_TOPICS: InsightTopicMeta[] = [
  {
    id: "discovery_struggle",
    label: "Finding New Music",
    shortLabel: "Discovery",
    description: "Where users get stuck exploring beyond familiar playlists",
    filterGroup: "discovery",
  },
  {
    id: "recommendation_frustrations",
    label: "Recommendation Issues",
    shortLabel: "Recommendations",
    description: "Complaints about repetitive, irrelevant, or low-quality suggestions",
    filterGroup: "recommendations",
  },
  {
    id: "listening_behaviors",
    label: "How People Listen",
    shortLabel: "Listening",
    description: "Comfort, mood, and context-driven listening patterns in reviews",
    filterGroup: "behavior",
  },
  {
    id: "repetitive_listening",
    label: "Same Songs & Playlists",
    shortLabel: "Repetition",
    description: "Why users replay the same content instead of discovering more",
    filterGroup: "behavior",
  },
  {
    id: "segment_discovery_challenges",
    label: "Who Is Struggling Most",
    shortLabel: "Audiences",
    description: "Behavioral segments with the highest discovery friction",
    filterGroup: "audience",
  },
  {
    id: "unmet_needs",
    label: "What Users Want Next",
    shortLabel: "Opportunities",
    description: "Recurring feature requests and gaps surfaced in reviews",
    filterGroup: "opportunities",
  },
];

export const INSIGHT_FILTER_GROUPS = [
  { id: "all", label: "All topics" },
  { id: "discovery", label: "Discovery blockers" },
  { id: "recommendations", label: "Recommendation quality" },
  { id: "behavior", label: "Listening habits" },
  { id: "audience", label: "Audience pain" },
  { id: "opportunities", label: "Feature gaps" },
] as const;

export type InsightFilterGroupId = (typeof INSIGHT_FILTER_GROUPS)[number]["id"];

export function getTopicMeta(id: string): InsightTopicMeta | undefined {
  return INSIGHT_TOPICS.find((t) => t.id === id);
}

export interface InsightAnswer {
  topicId: InsightTopicId;
  label: string;
  shortLabel: string;
  description: string;
  filterGroup: InsightTopicMeta["filterGroup"];
  findingSummary: string;
  reviewCount: number;
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
    negativePct: number;
  };
  topThemes: { theme: string; count: number }[];
  segmentBreakdown: { segment: string; count: number; pct: number }[];
  affectedSegments: string[];
  quotes: string[];
  avgRating?: number;
  relatedClusters: {
    clusterId: number;
    reviewCount: number;
    painPoint: string;
    severity: number;
    productOpportunity: string;
  }[];
}

export interface InsightsData {
  generatedAt: string;
  totalReviews: number;
  topics: InsightAnswer[];
  dataSource: "supabase" | "local";
}
