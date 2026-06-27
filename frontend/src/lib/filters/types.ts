/** Phase 4.8 — global multi-level filter state */

export interface GlobalFiltersState {
  // Base filters
  dateRange: string;
  source: string;
  theme: string;
  sentiment: string;
  cluster: string;
  opportunityTier: string;
  // Five-level segmentation
  business: string;
  engagement: string;
  behavior: string;
  context: string;
  pain: string;
}

export const DEFAULT_GLOBAL_FILTERS: GlobalFiltersState = {
  dateRange: "all",
  source: "all",
  theme: "all",
  sentiment: "all",
  cluster: "all",
  opportunityTier: "all",
  business: "all",
  engagement: "all",
  behavior: "all",
  context: "all",
  pain: "all",
};

export interface FilterPreset {
  id: string;
  name: string;
  filters: GlobalFiltersState;
}

export type FilterKey = keyof GlobalFiltersState;

export const BEHAVIOR_SEGMENT_MAP: Record<string, string> = {
  discovery_seeker: "Discovery Seeker",
  habit_listener: "Habit Listener",
  playlist_driven: "Playlist Driven",
  casual_listener: "Casual Listener",
  heavy_listener: "Heavy Listener",
  niche_listener: "Niche Listener",
};

export const BUSINESS_SEGMENT_MAP: Record<string, string[]> = {
  premium: ["Premium User"],
  free: ["Casual Listener"],
  new: ["New User"],
  heavy: ["Heavy Listener"],
  niche: ["Niche Music Listener"],
};

export const PAIN_THEME_KEYWORDS: Record<string, string[]> = {
  discovery: ["Search & Discovery", "Discover Weekly", "Discovery"],
  recommendations: ["Recommendation", "Repetitive Recommendations"],
  playlist: ["Playlist Fatigue", "Playlist"],
  widget: ["widget", "Widget"],
  critical: ["Critical"],
  high: ["High"],
};

export const STORAGE_KEY = "growth-intelligence-filters";
export const PRESETS_STORAGE_KEY = "growth-intelligence-filter-presets";
