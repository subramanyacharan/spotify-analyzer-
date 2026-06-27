import type { InsightsData } from "../insights/catalog";
import { getSupabaseServerClient } from "../supabase/server";
import { loadInsightsFromLocal, parseInsightsPayload } from "./insights-local";

export async function getInsightsData(): Promise<InsightsData> {
  const client = getSupabaseServerClient();

  if (client) {
    try {
      const { data: rows } = await client
        .from("weekly_insights")
        .select("top_themes, created_at")
        .order("created_at", { ascending: false })
        .limit(1);

      const row = rows?.[0];
      if (row?.top_themes && typeof row.top_themes === "object") {
        const topThemes = row.top_themes as Record<string, unknown>;
        const payload = topThemes.problem_statement_insights as Record<string, unknown> | undefined;
        if (payload?.answers) {
          return parseInsightsPayload(payload, "supabase");
        }
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
