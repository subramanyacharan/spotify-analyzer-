import type { InsightsData } from "../insights/catalog";
import { getSupabaseServerClient } from "../supabase/server";
import { fetchMergedTopThemes, pickPayload } from "./weekly-insights-merge";
import { loadInsightsFromLocal, parseInsightsPayload } from "./insights-local";

export async function getInsightsData(): Promise<InsightsData> {
  const client = getSupabaseServerClient();

  if (client) {
    try {
      const merged = await fetchMergedTopThemes();
      const payload = pickPayload(merged, "problem_statement_insights");
      if (payload?.answers) {
        return parseInsightsPayload(payload, "supabase");
      }
    } catch {
      /* fall through */
    }
  }
  const local = await loadInsightsFromLocal();
  if (local) return local;

  return {
    generatedAt: new Date().toISOString(),
    totalReviews: 0,
    topics: [],
    dataSource: "local",
  };
}
