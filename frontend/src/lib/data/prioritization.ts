import type { PrioritizationData } from "../opportunities/types";
import { getSupabaseServerClient } from "../supabase/server";
import {
  fetchCanonicalCorpusReviewCount,
  fetchMergedTopThemes,
  pickPayload,
  resolveDashboardGeneratedAt,
} from "./weekly-insights-merge";
import {
  loadPrioritizationFromLocal,
  parsePrioritizationPayload,
} from "./prioritization-local";

export async function getPrioritizationData(): Promise<PrioritizationData> {
  const client = getSupabaseServerClient();

  if (client) {
    try {
      const merged = await fetchMergedTopThemes();
      const payload = pickPayload(merged, "insight_prioritization");
      if (payload?.prioritization_matrix) {
        const sources = { prioritization: payload };
        const data = parsePrioritizationPayload(payload, "supabase");
        data.totalReviews = await fetchCanonicalCorpusReviewCount(sources);
        data.generatedAt = await resolveDashboardGeneratedAt(sources);
        return data;
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
