import type { InsightsData } from "../insights/catalog";
import {
  corpusSourcesFromThemes,
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
    const sources = corpusSourcesFromThemes(merged);

    if (payload?.answers) {
      const data = parseInsightsPayload(payload, "supabase", sources.prioritization);
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
