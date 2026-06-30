import type { PrioritizationData } from "../opportunities/types";
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
  try {
    const merged = await fetchMergedTopThemes();
    const payload = pickPayload(merged, "insight_prioritization");
    const weeklyReport = pickPayload(merged, "weekly_report");

    if (payload?.prioritization_matrix) {
      const sources = { prioritization: payload, weeklyReport };
      const data = parsePrioritizationPayload(payload, "supabase");
      data.totalReviews = await fetchCanonicalCorpusReviewCount(sources);
      data.generatedAt = await resolveDashboardGeneratedAt(sources);
      return data;
    }
  } catch (e) {
    console.error("[prioritization] snapshot load failed:", e);
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
