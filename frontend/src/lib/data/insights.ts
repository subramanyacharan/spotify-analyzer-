import type { InsightsData } from "../insights/catalog";
import {
  fetchCanonicalCorpusReviewCount,
  fetchMergedTopThemes,
  pickPayload,
  resolveDashboardGeneratedAt,
} from "./weekly-insights-merge";
import { loadInsightsFromLocal, parseInsightsPayload } from "./insights-local";

export async function getInsightsData(): Promise<InsightsData> {
  try {
    const merged = await fetchMergedTopThemes();
    const payload = pickPayload(merged, "problem_statement_insights");
    const prioritization = pickPayload(merged, "insight_prioritization");
    const weeklyReport = pickPayload(merged, "weekly_report");

    if (payload?.answers) {
      const sources = { problemStatement: payload, prioritization, weeklyReport };
      const data = parseInsightsPayload(payload, "supabase", prioritization);
      data.totalReviews = await fetchCanonicalCorpusReviewCount(sources);
      data.generatedAt = await resolveDashboardGeneratedAt(sources);
      return data;
    }
  } catch (e) {
    console.error("[insights] snapshot load failed:", e);
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
