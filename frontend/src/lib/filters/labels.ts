import type { FilterKey, GlobalFiltersState } from "./types";
import { dateRangeLabel } from "./match";
import {
  BEHAVIOR_SEGMENT_MAP,
  BUSINESS_SEGMENT_MAP,
  DEFAULT_GLOBAL_FILTERS,
} from "./types";

const BASE_LABELS: Partial<Record<FilterKey, Record<string, string>>> = {
  dateRange: {
    last_7: "Last 7 days",
    last_30: "Last 30 days",
    last_90: "Last 90 days",
  },
  source: {
    play_store: "Play Store",
    app_store: "App Store",
  },
  sentiment: {
    negative: "Negative",
    positive: "Positive",
    neutral: "Neutral",
  },
  cluster: {
    "0": "Issue group A",
    "1": "Issue group B",
    "2": "Issue group C",
    "3": "Issue group D",
    "4": "Issue group E",
  },
  opportunityTier: {
    Critical: "Critical tier",
    High: "High tier",
    Monitor: "Monitor tier",
  },
  business: {
    premium: "Premium",
    free: "Free / Casual",
    new: "New User",
    heavy: "Heavy Listener",
    niche: "Niche",
  },
  engagement: {
    heavy: "Heavy / New",
    casual: "Casual / Medium",
    low: "Low activity",
  },
  behavior: Object.fromEntries(
    Object.entries(BEHAVIOR_SEGMENT_MAP).map(([k, v]) => [k, v])
  ),
  context: {
    play_store: "Play Store",
    app_store: "App Store",
    mobile: "Mobile",
    discovery: "Discovery intent",
    comfort: "Comfort habit",
    mood: "Mood context",
  },
  pain: {
    discovery: "Discovery UX",
    recommendations: "Recommendations",
    playlist: "Playlist fatigue",
    widget: "Widget issues",
    critical: "Critical friction",
    high: "High friction",
  },
};

export function getFilterChipLabel(key: FilterKey, value: string): string {
  if (value === "all") return "";
  if (key === "dateRange") return dateRangeLabel(value);
  if (key === "theme") return `Theme: ${value}`;
  return BASE_LABELS[key]?.[value] ?? `${key}: ${value}`;
}

export function getActiveFilterChips(
  filters: GlobalFiltersState
): { key: FilterKey; value: string; label: string }[] {
  const chips: { key: FilterKey; value: string; label: string }[] = [];
  (Object.keys(DEFAULT_GLOBAL_FILTERS) as FilterKey[]).forEach((key) => {
    const value = filters[key];
    if (value !== DEFAULT_GLOBAL_FILTERS[key]) {
      const label = getFilterChipLabel(key, value);
      if (label) chips.push({ key, value, label });
    }
  });
  return chips;
}
