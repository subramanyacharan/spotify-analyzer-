import type { OpportunitiesData } from "../opportunities/types";
import { getSupabaseServerClient } from "../supabase/server";
import { loadOpportunitiesFromLocal, parseOpportunitiesPayload } from "./opportunities-local";

export async function getOpportunitiesData(): Promise<OpportunitiesData> {
  const client = getSupabaseServerClient();

  if (client) {
    try {
      const { data: rows } = await client
        .from("weekly_insights")
        .select("top_themes")
        .order("created_at", { ascending: false })
        .limit(1);

      const payload = (rows?.[0]?.top_themes as Record<string, unknown>)?.opportunity_scores as
        | Record<string, unknown>
        | undefined;

      if (payload?.opportunities) {
        return parseOpportunitiesPayload(payload, "supabase");
      }
    } catch {
      /* fall through */
    }
  }

  const local = await loadOpportunitiesFromLocal();
  if (local) return local;

  return {
    generatedAt: new Date().toISOString(),
    totalReviews: 0,
    scoringFormula: "Frequency × Severity × Segment Impact × Sentiment Intensity",
    opportunities: [],
    dataSource: "local",
  };
}
