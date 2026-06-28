import { getSupabaseServerClient } from "../supabase/server";
import { analysisWindowStartIso } from "./analysis-window";

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

/** Merge top_themes keys from all weekly_insights rows (newest first). */
export async function fetchMergedTopThemes(): Promise<Record<string, unknown>> {
  const client = getSupabaseServerClient();
  if (!client) return {};

  try {
    const { data: rows } = await client
      .from("weekly_insights")
      .select("top_themes, created_at")
      .order("created_at", { ascending: false });

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

export async function fetchProcessedReviewCount(): Promise<number> {
  const client = getSupabaseServerClient();
  if (!client) return 0;

  const cutoff = analysisWindowStartIso();

  try {
    const { count } = await client
      .from("raw_reviews")
      .select("*", { count: "exact", head: true })
      .gte("review_date", cutoff);
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
