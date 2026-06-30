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

const MERGE_ROW_LIMIT = 24;

export function normalizeTopThemes(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  if (Array.isArray(raw)) return { legacy_top_themes: raw };
  return { ...(raw as Record<string, unknown>) };
}

type WeeklySnapshot = {
  themes: Record<string, unknown>;
  runAt: Date | null;
};

function flattenTopThemes(raw: unknown): Record<string, unknown> {
  const themes = normalizeTopThemes(raw);
  const flat: Record<string, unknown> = {};
  for (const key of PHASE3_THEME_KEYS) {
    if (themes[key]) flat[key] = themes[key];
  }
  for (const [key, value] of Object.entries(themes)) {
    if (value && !flat[key]) flat[key] = value;
  }
  return flat;
}

function mergeRowsNewestFirst(
  rows: Array<{ top_themes: unknown; created_at: string }>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const row of rows) {
    const themes = flattenTopThemes(row.top_themes);
    for (const key of PHASE3_THEME_KEYS) {
      if (themes[key] && !merged[key]) merged[key] = themes[key];
    }
    for (const [key, value] of Object.entries(themes)) {
      if (value && !merged[key]) merged[key] = value;
    }
  }
  return merged;
}

/**
 * Latest row sets the 90-day anchor; recent rows fill missing Phase 3 keys.
 * Pipeline stages write separate weekly_insights rows — the newest row is often partial.
 */
async function loadWeeklySnapshotFromDb(): Promise<WeeklySnapshot> {
  const client = getSupabaseServerClient();
  if (!client) return { themes: {}, runAt: null };

  try {
    const { data: rows } = await client
      .from("weekly_insights")
      .select("top_themes, created_at")
      .order("created_at", { ascending: false })
      .limit(MERGE_ROW_LIMIT);

    if (!rows?.length) return { themes: {}, runAt: null };

    return {
      themes: mergeRowsNewestFirst(rows),
      runAt: parseAnchor(rows[0].created_at),
    };
  } catch {
    return { themes: {}, runAt: null };
  }
}

const getCachedWeeklySnapshot = unstable_cache(
  loadWeeklySnapshotFromDb,
  ["merged-weekly-snapshot-v2"],
  { revalidate: 600 }
);

/** Phase 3 payloads merged from recent weekly_insights rows (newest wins per key). */
export async function fetchMergedTopThemes(): Promise<Record<string, unknown>> {
  const snap = await getCachedWeeklySnapshot();
  return snap.themes;
}

export async function fetchLatestWeeklyRunAt(): Promise<Date | null> {
  const snap = await getCachedWeeklySnapshot();
  return snap.runAt;
}

function parseAnchor(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Anchor the 90-day window to the latest weekly_insights row. */
export async function resolveAnalysisAnchorDate(
  sources: CorpusPayloadSources = {}
): Promise<Date> {
  const runAt = await fetchLatestWeeklyRunAt();
  if (runAt) return runAt;

  const fromPayload =
    parseAnchor(sources.prioritization?.generated_at) ??
    parseAnchor(sources.problemStatement?.generated_at) ??
    parseAnchor(sources.segmentDeepDives?.generated_at) ??
    parseAnchor(sources.opportunities?.generated_at) ??
    parseAnchor(sources.weeklyReport?.generated_at);

  if (fromPayload) return fromPayload;

  return new Date();
}

/** Count processed_reviews in the 90-day window (offline / validation only). */
export async function fetchProcessedReviewCount(
  anchor: Date = new Date()
): Promise<number> {
  const client = getSupabaseServerClient();
  if (!client) return 0;

  const start = analysisWindowStartFromAnchor(anchor);
  const end = analysisWindowEndFromAnchor(anchor);

  try {
    const { count } = await client
      .from("processed_reviews")
      .select("id, raw_reviews!inner(review_date)", { count: "exact", head: true })
      .gte("raw_reviews.review_date", start)
      .lte("raw_reviews.review_date", end);
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
 * Authoritative review count — Phase 3 snapshot totals (prioritization / weekly_report),
 * not per-question subsets from a partial problem_statement row.
 */
export async function fetchCanonicalCorpusReviewCount(
  sources: CorpusPayloadSources = {}
): Promise<number> {
  const snapshot = resolveCorpusReviewCount({
    prioritization: sources.prioritization,
    segmentDeepDives: sources.segmentDeepDives,
    opportunities: sources.opportunities,
    weeklyReport: sources.weeklyReport,
    problemStatement: null,
    fallback: sources.fallback,
  });
  if (snapshot > 0) return snapshot;

  const fromProblem = resolveCorpusReviewCount({
    problemStatement: sources.problemStatement,
  });
  if (fromProblem > 0) return fromProblem;

  const client = getSupabaseServerClient();
  if (client) {
    const anchor = await resolveAnalysisAnchorDate(sources);
    const fromDb = await fetchProcessedReviewCount(anchor);
    if (fromDb > 0) return fromDb;
  }
  return 0;
}

/** ISO timestamp for dashboard captions — always the latest weekly run anchor. */
export async function resolveDashboardGeneratedAt(
  sources: CorpusPayloadSources = {}
): Promise<string> {
  const anchor = await resolveAnalysisAnchorDate(sources);
  return anchor.toISOString();
}
