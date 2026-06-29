import { unstable_cache } from "next/cache";
import { getSupabaseServerClient } from "../supabase/server";
import {
  analysisWindowEndFromAnchor,
  analysisWindowStartFromAnchor,
} from "./analysis-window";
import {
  resolveCorpusReviewCount,
  type CorpusPayloadSources,
} from "./corpus-metrics";

export const PHASE3_THEME_KEYS = [
  "problem_statement_insights",
  "segment_deep_dives",
  "opportunity_scores",
  "insight_prioritization",
  "dashboard_snapshot",
  "weekly_report",
] as const;

export function normalizeTopThemes(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  if (Array.isArray(raw)) return { legacy_top_themes: raw };
  return { ...(raw as Record<string, unknown>) };
}

async function loadMergedTopThemesFromDb(): Promise<Record<string, unknown>> {
  const client = getSupabaseServerClient();
  if (!client) return {};

  try {
    const { data: rows } = await client
      .from("weekly_insights")
      .select("top_themes, created_at")
      .order("created_at", { ascending: false })
      .limit(24);

    const merged: Record<string, unknown> = {};
    for (const row of rows ?? []) {
      const themes = normalizeTopThemes(row.top_themes);
      for (const key of PHASE3_THEME_KEYS) {
        if (themes[key] && !merged[key]) {
          merged[key] = themes[key];
        }
      }
      for (const [key, value] of Object.entries(themes)) {
        if (value && !merged[key]) merged[key] = value;
      }
    }
    return merged;
  } catch {
    return {};
  }
}

const getCachedMergedTopThemes = unstable_cache(
  loadMergedTopThemesFromDb,
  ["merged-top-themes"],
  { revalidate: 600 }
);

/** Merge top_themes keys from recent weekly_insights rows (newest first). */
export async function fetchMergedTopThemes(): Promise<Record<string, unknown>> {
  return getCachedMergedTopThemes();
}

function parseAnchor(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Anchor the 90-day window to the latest weekly pipeline run, not the browser clock. */
export async function resolveAnalysisAnchorDate(
  sources: CorpusPayloadSources = {}
): Promise<Date> {
  const fromPayload =
    parseAnchor(sources.prioritization?.generated_at) ??
    parseAnchor(sources.problemStatement?.generated_at) ??
    parseAnchor(sources.segmentDeepDives?.generated_at) ??
    parseAnchor(sources.opportunities?.generated_at) ??
    parseAnchor(sources.weeklyReport?.generated_at);

  if (fromPayload) return fromPayload;

  const client = getSupabaseServerClient();
  if (client) {
    try {
      const { data } = await client
        .from("weekly_insights")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const fromRow = parseAnchor(data?.created_at);
      if (fromRow) return fromRow;
    } catch {
      /* fall through */
    }
  }

  return new Date();
}

/** Count raw_reviews whose review_date falls in [anchor − 90 days, anchor]. */
export async function fetchProcessedReviewCount(
  anchor: Date = new Date()
): Promise<number> {
  const client = getSupabaseServerClient();
  if (!client) return 0;

  const start = analysisWindowStartFromAnchor(anchor);
  const end = analysisWindowEndFromAnchor(anchor);

  try {
    const { count } = await client
      .from("raw_reviews")
      .select("*", { count: "exact", head: true })
      .gte("review_date", start)
      .lte("review_date", end);
    return count ?? 0;
  } catch {
    return 0;
  }
}

export function pickPayload(
  merged: Record<string, unknown>,
  key: string
): Record<string, unknown> | null {
  const value = merged[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Authoritative 90-day corpus count for live dashboards.
 * Prefers a date-filtered Supabase query anchored to the last weekly run;
 * falls back to Phase 3 snapshot totals for offline/local mode.
 */
export async function fetchCanonicalCorpusReviewCount(
  sources: CorpusPayloadSources = {}
): Promise<number> {
  const client = getSupabaseServerClient();
  if (client) {
    const anchor = await resolveAnalysisAnchorDate(sources);
    const fromDb = await fetchProcessedReviewCount(anchor);
    if (fromDb > 0) return fromDb;
  }
  return resolveCorpusReviewCount(sources);
}
