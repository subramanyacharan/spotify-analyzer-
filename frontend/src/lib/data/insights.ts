import type { InsightsData } from "../insights/catalog";
import { getSupabaseServerClient } from "../supabase/server";
import { applyWindowCorpusToInsights } from "./apply-window-corpus";
import { fetchMergedTopThemes, fetchCanonicalCorpusReviewCount, pickPayload } from "./weekly-insights-merge";
import { getWindowCorpus } from "./window-corpus";
import { loadInsightsFromLocal, parseInsightsPayload } from "./insights-local";

export async function getInsightsData(): Promise<InsightsData> {
  const client = getSupabaseServerClient();

  if (client) {
    try {
      const merged = await fetchMergedTopThemes();
      const payload = pickPayload(merged, "problem_statement_insights");
      const prioritization = pickPayload(merged, "insight_prioritization");
      if (payload?.answers) {
        const sources = { problemStatement: payload, prioritization };
        const data = parseInsightsPayload(payload, "supabase", prioritization);
        const corpus = await getWindowCorpus(sources);
        if (corpus) {
          applyWindowCorpusToInsights(data, corpus);
        } else {
          data.totalReviews = await fetchCanonicalCorpusReviewCount(sources);
        }
        return data;
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
