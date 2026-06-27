import type { PrioritizationData } from "../opportunities/types";
import { getSupabaseServerClient } from "../supabase/server";
import { fetchMergedTopThemes, pickPayload } from "./weekly-insights-merge";
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
