import type { FilterKey, GlobalFiltersState } from "./types";
import {
  BEHAVIOR_SEGMENT_MAP,
  BUSINESS_SEGMENT_MAP,
  DEFAULT_GLOBAL_FILTERS,
  PAIN_THEME_KEYWORDS,
} from "./types";

export function isDefaultFilters(filters: GlobalFiltersState): boolean {
  return (Object.keys(DEFAULT_GLOBAL_FILTERS) as FilterKey[]).every(
    (k) => filters[k] === DEFAULT_GLOBAL_FILTERS[k]
  );
}

export function countActiveFilters(filters: GlobalFiltersState): number {
  return (Object.keys(DEFAULT_GLOBAL_FILTERS) as FilterKey[]).filter(
    (k) => filters[k] !== DEFAULT_GLOBAL_FILTERS[k]
  ).length;
}

function matchesTheme(themes: string[], filterTheme: string): boolean {
  if (filterTheme === "all") return true;
  return themes.some(
    (t) =>
      t.toLowerCase().includes(filterTheme.toLowerCase()) ||
      filterTheme.toLowerCase().includes(t.toLowerCase().split(" ")[0])
  );
}

function matchesSentiment(negativePct: number, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "negative") return negativePct > 20;
  if (filter === "positive") return negativePct < 15;
  if (filter === "neutral") return negativePct >= 15 && negativePct <= 20;
  return true;
}

function matchesBehavior(segments: string[], filter: string): boolean {
  if (filter === "all") return true;
  const label = BEHAVIOR_SEGMENT_MAP[filter];
  if (!label) return true;
  return segments.some((s) => s.toLowerCase().includes(label.toLowerCase()));
}

function matchesBusiness(segments: string[], filter: string): boolean {
  if (filter === "all") return true;
  const targets = BUSINESS_SEGMENT_MAP[filter] ?? [];
  return segments.some((s) => targets.some((t) => s.includes(t)));
}

function matchesPain(themes: string[], painPoint: string, filter: string): boolean {
  if (filter === "all") return true;
  const keywords = PAIN_THEME_KEYWORDS[filter] ?? [];
  const text = `${themes.join(" ")} ${painPoint}`.toLowerCase();
  return keywords.some((k) => text.includes(k.toLowerCase()));
}

function matchesCluster(clusterId: number | undefined, filter: string): boolean {
  if (filter === "all") return true;
  if (clusterId === undefined) return false;
  return String(clusterId) === filter;
}

function matchesTier(tier: string, filter: string): boolean {
  if (filter === "all") return true;
  return tier.toLowerCase() === filter.toLowerCase();
}

const CONTEXT_KEYWORDS: Record<string, string[]> = {
  play_store: ["play store", "play_store", "android"],
  app_store: ["app store", "app_store", "ios"],
  discovery: ["discovery", "discover weekly", "find new", "explore"],
  comfort: ["comfort", "habit", "familiar", "same songs"],
  mood: ["mood", "context", "vibe"],
};

function matchesSourceFilter(
  sourceFilter: string,
  segments: string[],
  hints: string[] = []
): boolean {
  if (sourceFilter === "all") return true;
  const text = `${hints.join(" ")} ${segments.join(" ")}`.toLowerCase();
  const key = sourceFilter.replace("_", " ");
  return text.includes(sourceFilter) || text.includes(key);
}

function matchesContextFilter(
  contextFilter: string,
  segments: string[],
  themes: string[],
  hints: string[] = []
): boolean {
  if (contextFilter === "all") return true;
  const text = `${hints.join(" ")} ${segments.join(" ")} ${themes.join(" ")}`.toLowerCase();
  const keywords = CONTEXT_KEYWORDS[contextFilter] ?? [contextFilter];
  return keywords.some((k) => text.includes(k));
}

function matchesEngagement(segments: string[], filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "heavy")
    return segments.some((s) => /heavy|new|discovery seeker/i.test(s));
  if (filter === "casual") return segments.some((s) => /casual|playlist/i.test(s));
  if (filter === "low") return segments.some((s) => /niche|heavy listener/i.test(s));
  return true;
}

function matchesContext(filter: string, globalContext: string): boolean {
  if (globalContext === "all") return true;
  if (filter === "all") return true;
  return filter === globalContext || globalContext.includes(filter);
}

function matchesFrictionTier(frictionScore: number, filter: string): boolean {
  if (filter === "all" || filter === "critical" || filter === "high") {
    if (filter === "critical") return frictionScore >= 0.7;
    if (filter === "high") return frictionScore >= 0.5;
    return true;
  }
  return matchesPain([], "", filter);
}

/** Generic AND matcher for insight/opportunity rows */
export function matchesGlobalFilters(
  filters: GlobalFiltersState,
  ctx: {
    themes?: string[];
    segments?: string[];
    negativePct?: number;
    tier?: string;
    clusterId?: number;
    painPoint?: string;
    frictionScore?: number;
    sourceHints?: string[];
  }
): boolean {
  const themes = ctx.themes ?? [];
  const segments = ctx.segments ?? [];
  const negativePct = ctx.negativePct ?? 0;
  const sourceHints = ctx.sourceHints ?? [];

  if (!matchesTheme(themes, filters.theme)) return false;
  if (!matchesSentiment(negativePct, filters.sentiment)) return false;
  if (!matchesBehavior(segments, filters.behavior)) return false;
  if (!matchesBusiness(segments, filters.business)) return false;
  if (!matchesEngagement(segments, filters.engagement)) return false;
  if (!matchesSourceFilter(filters.source, segments, sourceHints)) return false;
  if (!matchesContextFilter(filters.context, segments, themes, sourceHints))
    return false;
  if (!matchesCluster(ctx.clusterId, filters.cluster)) return false;
  if (ctx.tier && !matchesTier(ctx.tier, filters.opportunityTier)) return false;
  if (
    !matchesPain(themes, ctx.painPoint ?? "", filters.pain) &&
    filters.pain !== "all"
  ) {
    if (ctx.frictionScore !== undefined) {
      if (!matchesFrictionTier(ctx.frictionScore, filters.pain)) return false;
    } else return false;
  }

  return true;
}

export function dateRangeLabel(range: string): string {
  const labels: Record<string, string> = {
    all: "All time",
    last_7: "Last 7 days",
    last_30: "Last 30 days",
    last_90: "Last 90 days",
  };
  return labels[range] ?? range;
}

export function filterScaleFactor(dateRange: string): number {
  if (dateRange === "last_7") return 0.12;
  if (dateRange === "last_30") return 0.35;
  if (dateRange === "last_90") return 1;
  return 1;
}
