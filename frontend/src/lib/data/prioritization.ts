import type { PrioritizationData } from "../opportunities/types";
import { getSupabaseServerClient } from "../supabase/server";
import {
  loadPrioritizationFromLocal,
  parsePrioritizationPayload,
} from "./prioritization-local";

export async function getPrioritizationData(): Promise<PrioritizationData> {
  const client = getSupabaseServerClient();

  if (client) {
    try {
      const { data: rows } = await client
        .from("weekly_insights")
        .select("top_themes")
        .order("created_at", { ascending: false })
        .limit(1);

      const payload = (rows?.[0]?.top_themes as Record<string, unknown>)
        ?.insight_prioritization as Record<string, unknown> | undefined;

      if (payload?.prioritization_matrix) {
        return parsePrioritizationPayload(payload, "supabase");
      }
    } catch {
      /* fall through */
    }
  }

  const local = await loadPrioritizationFromLocal();
  if (local) return local;

  return {
    generatedAt: new Date().toISOString(),
    totalReviews: 0,
    tierSummary: {},
    items: [],
    topPriority: null,
    dataSource: "local",
  };
}
