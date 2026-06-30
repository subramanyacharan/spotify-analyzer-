import { cache } from "react";
import { getSupabaseServerClient } from "../supabase/server";
import {
  analysisWindowEndFromAnchor,
  analysisWindowStartFromAnchor,
} from "./analysis-window";
import {
  resolveCorpusReviewCount,
  type CorpusPayloadSources,
} from "./corpus-metrics";
import { getBundledPhase3Themes } from "./bundled-snapshot";

export const PHASE3_THEME_KEYS = [
  "problem_statement_insights",
  "segment_deep_dives",
  "opportunity_scores",
  "insight_prioritization",
  "dashboard_snapshot",
  "weekly_report",
] as const;

const MERGE_ROW_LIMIT = 24;
const MEMORY_TTL_MS = 5 * 60 * 1000;

export type WeeklySnapshotSource = "supabase" | "bundled" | "supabase+bundled";

export type WeeklySnapshot = {
  themes: Record<string, unknown>;
  runAt: Date | null;
  source: WeeklySnapshotSource;
};

export function normalizeTopThemes(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  if (Array.isArray(raw)) return { legacy_top_themes: raw };
  return { ...(raw as Record<string, unknown>) };
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

function fillMissingKeys(
  target: Record<string, unknown>,
  fallback: Record<string, unknown>
): void {
  for (const key of PHASE3_THEME_KEYS) {
    if (!target[key] && fallback[key]) target[key] = fallback[key];
  }
}

export function hasRequiredPhase3Keys(themes: Record<string, unknown>): boolean {
  const prioritization = themes.insight_prioritization as Record<string, unknown> | undefined;
  const segments = themes.segment_deep_dives as Record<string, unknown> | undefined;
  return Boolean(
    prioritization?.prioritization_matrix &&
      segments?.segment_profiles &&
      Array.isArray(segments.segment_profiles) &&
      (segments.segment_profiles as unknown[]).length > 0
  );
}

function parseAnchor(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function anchorFromThemes(themes: Record<string, unknown>): Date | null {
  for (const key of ["weekly_report", "dashboard_snapshot", "insight_prioritization"] as const) {
    const payload = themes[key] as Record<string, unknown> | undefined;
    const dt = parseAnchor(payload?.generated_at);
    if (dt) return dt;
  }
  return null;
}

async function loadWeeklySnapshotFromDb(): Promise<WeeklySnapshot | null> {
  const client = getSupabaseServerClient();
  if (!client) return null;

  const { data: rows, error } = await client
    .from("weekly_insights")
    .select("top_themes, created_at")
    .order("created_at", { ascending: false })
    .limit(MERGE_ROW_LIMIT);

  if (error) {
    console.error("[weekly-insights] Supabase query failed:", error.message);
    return null;
  }
  if (!rows?.length) return null;

  return {
    themes: mergeRowsNewestFirst(rows),
    runAt: parseAnchor(rows[0].created_at),
    source: "supabase",
  };
}

let memorySnapshot: { at: number; snap: WeeklySnapshot } | null = null;

async function loadWeeklySnapshotImpl(): Promise<WeeklySnapshot> {
  if (memorySnapshot && Date.now() - memorySnapshot.at < MEMORY_TTL_MS) {
    return memorySnapshot.snap;
  }

  const bundled = getBundledPhase3Themes();
  const fromDb = await loadWeeklySnapshotFromDb();

  if (fromDb) {
    fillMissingKeys(fromDb.themes, bundled);
    const snap: WeeklySnapshot = {
      themes: fromDb.themes,
      runAt: fromDb.runAt ?? anchorFromThemes(fromDb.themes) ?? anchorFromThemes(bundled),
      source: hasRequiredPhase3Keys(fromDb.themes) ? "supabase" : "supabase+bundled",
    };
    if (hasRequiredPhase3Keys(snap.themes)) {
      memorySnapshot = { at: Date.now(), snap };
    }
    return snap;
  }

  const snap: WeeklySnapshot = {
    themes: bundled,
    runAt: anchorFromThemes(bundled),
    source: "bundled",
  };
  if (hasRequiredPhase3Keys(snap.themes)) {
    memorySnapshot = { at: Date.now(), snap };
  }
  return snap;
}

/** One snapshot load per request — deduped via React cache. */
export const getWeeklySnapshot = cache(loadWeeklySnapshotImpl);

/** Phase 3 payloads for dashboard loaders. */
export async function fetchMergedTopThemes(): Promise<Record<string, unknown>> {
  const snap = await getWeeklySnapshot();
  return snap.themes;
}

export async function fetchLatestWeeklyRunAt(): Promise<Date | null> {
  const snap = await getWeeklySnapshot();
  return snap.runAt;
}

export async function fetchWeeklySnapshotMeta(): Promise<{
  source: WeeklySnapshotSource;
  keys: string[];
  hasRequiredKeys: boolean;
  runAt: string | null;
}> {
  const snap = await getWeeklySnapshot();
  return {
    source: snap.source,
    keys: Object.keys(snap.themes),
    hasRequiredKeys: hasRequiredPhase3Keys(snap.themes),
    runAt: snap.runAt?.toISOString() ?? null,
  };
}

/** Anchor the 90-day window to the latest weekly pipeline run. */
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

/** Count processed_reviews in the 90-day window (validation / fallback only). */
export async function fetchProcessedReviewCount(
  anchor: Date = new Date()
): Promise<number> {
  const client = getSupabaseServerClient();
  if (!client) return 0;

  const start = analysisWindowStartFromAnchor(anchor);
  const end = analysisWindowEndFromAnchor(anchor);

  try {
    const { count, error } = await client
      .from("processed_reviews")
      .select("id, raw_reviews!inner(review_date)", { count: "exact", head: true })
      .gte("raw_reviews.review_date", start)
      .lte("raw_reviews.review_date", end);
    if (error) return 0;
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
