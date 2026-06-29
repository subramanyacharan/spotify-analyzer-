import type { OpportunitiesData } from "../opportunities/types";
import { getSupabaseServerClient } from "../supabase/server";
import { applyWindowCorpusToOpportunities } from "./apply-window-corpus";
import { fetchMergedTopThemes, fetchCanonicalCorpusReviewCount, pickPayload } from "./weekly-insights-merge";
import { getWindowCorpus } from "./window-corpus";
import { loadOpportunitiesFromLocal, parseOpportunitiesPayload } from "./opportunities-local";

export async function getOpportunitiesData(): Promise<OpportunitiesData> {
  const client = getSupabaseServerClient();

  if (client) {
    try {
      const merged = await fetchMergedTopThemes();
      const payload = pickPayload(merged, "opportunity_scores");
      const prioritization = pickPayload(merged, "insight_prioritization");
      if (payload?.opportunities) {
        const sources = { opportunities: payload, prioritization };
        const data = parseOpportunitiesPayload(payload, "supabase", prioritization);
        const corpus = await getWindowCorpus(sources);
        if (corpus) {
          applyWindowCorpusToOpportunities(data, corpus);
        } else {
          data.totalReviews = await fetchCanonicalCorpusReviewCount(sources);
        }
        return data;
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
