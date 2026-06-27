import type { OpportunitiesData } from "../opportunities/types";
import { getSupabaseServerClient } from "../supabase/server";
import { fetchMergedTopThemes, pickPayload } from "./weekly-insights-merge";
import { loadOpportunitiesFromLocal, parseOpportunitiesPayload } from "./opportunities-local";

export async function getOpportunitiesData(): Promise<OpportunitiesData> {
  const client = getSupabaseServerClient();

  if (client) {
    try {
      const merged = await fetchMergedTopThemes();
      const payload = pickPayload(merged, "opportunity_scores");
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
