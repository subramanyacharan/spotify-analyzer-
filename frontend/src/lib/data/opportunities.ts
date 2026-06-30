import type { OpportunitiesData } from "../opportunities/types";
import {
  fetchCanonicalCorpusReviewCount,
  fetchMergedTopThemes,
  pickPayload,
  resolveDashboardGeneratedAt,
} from "./weekly-insights-merge";
import { loadOpportunitiesFromLocal, parseOpportunitiesPayload } from "./opportunities-local";

export async function getOpportunitiesData(): Promise<OpportunitiesData> {
  try {
    const merged = await fetchMergedTopThemes();
    const payload = pickPayload(merged, "opportunity_scores");
    const prioritization = pickPayload(merged, "insight_prioritization");
    const weeklyReport = pickPayload(merged, "weekly_report");

    if (payload?.opportunities) {
      const sources = { opportunities: payload, prioritization, weeklyReport };
      const data = parseOpportunitiesPayload(payload, "supabase", prioritization);
      data.totalReviews = await fetchCanonicalCorpusReviewCount(sources);
      data.generatedAt = await resolveDashboardGeneratedAt(sources);
      return data;
    }
  } catch (e) {
    console.error("[opportunities] snapshot load failed:", e);
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
