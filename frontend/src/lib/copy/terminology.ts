import type { SegmentationLens } from "@/lib/types";

/** Shared labels — keep Overview and Segments lens tabs aligned. */
export const LENS_LABELS: Record<SegmentationLens, string> = {
  business: "User type",
  engagement: "Engagement level",
  behavior: "Listening behavior",
  context: "Use context",
  pain: "Pain point",
};

export const LENS_DESCRIPTIONS: Record<SegmentationLens, string> = {
  business: "Subscription and audience type",
  engagement: "How actively users listen",
  behavior: "Discovery vs habit listening patterns",
  context: "Where and why users listen",
  pain: "Complaint severity and themes",
};

export const KPI_LABELS = {
  reviews: "Reviews analyzed",
  leadingTheme: "Leading theme",
  negativeFeedback: "Negative feedback",
  topAudience: "Highest-friction audience",
  priorityOpportunity: "Priority opportunity",
} as const;

export const TIER_LABELS = {
  Critical: "Critical",
  High: "High",
  Monitor: "Monitor",
} as const;

export const DATA_FRESHNESS = (source: "supabase" | "local", date?: string) =>
  date
    ? `Updated ${new Date(date).toLocaleDateString(undefined, { dateStyle: "medium" })} · ${source === "supabase" ? "Live data" : "Snapshot"}`
    : source === "supabase"
      ? "Live data"
      : "Snapshot data";

/** Themes that typically carry complaint signal — used for bar coloring on insights. */
export const COMPLAINT_THEME_PATTERN =
  /fatigue|issue|repetitive|worst|limited|poor|ux|complaint|discover weekly|search/i;

export function themeBarColor(theme: string, cardNegativePct: number): string {
  const isComplaintTheme = COMPLAINT_THEME_PATTERN.test(theme);
  if (isComplaintTheme || cardNegativePct >= 25) return "bg-red-500/85";
  if (cardNegativePct >= 15 || isComplaintTheme) return "bg-amber-500/75";
  return "bg-[#1db954]/70";
}

export function chartBarColor(negativePct: number): string {
  if (negativePct >= 25) return "#ef4444";
  if (negativePct >= 15) return "#f59e0b";
  return "#1db954";
}
