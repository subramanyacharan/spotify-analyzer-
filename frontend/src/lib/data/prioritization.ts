import type { PrioritizationData } from "../opportunities/types";
import { getSupabaseServerClient } from "../supabase/server";
import { applyWindowCorpusToPrioritization } from "./apply-window-corpus";
import { fetchMergedTopThemes, fetchCanonicalCorpusReviewCount, pickPayload } from "./weekly-insights-merge";
import { getWindowCorpus } from "./window-corpus";
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
        const corpus = await getWindowCorpus(sources);
        if (corpus) {
          applyWindowCorpusToPrioritization(data, corpus);
        } else {
          data.totalReviews = await fetchCanonicalCorpusReviewCount(sources);
        }
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
