import type { SegmentsData } from "../analytics/types";
import { getSupabaseServerClient } from "../supabase/server";
import { fetchMergedTopThemes, pickPayload } from "./weekly-insights-merge";
import { loadSegmentsFromLocal, parseSegmentsPayload } from "./segments-local";

export async function getSegmentsData(): Promise<SegmentsData> {
  const client = getSupabaseServerClient();

  if (client) {
    try {
      const merged = await fetchMergedTopThemes();
      const segmentDeepDives = pickPayload(merged, "segment_deep_dives");
      const prioritization = pickPayload(merged, "insight_prioritization");

      if (segmentDeepDives?.segment_profiles) {
        return parseSegmentsPayload(segmentDeepDives, prioritization ?? null, "supabase");
      }
    } catch {
      /* fall through */
    }
  }
  const local = await loadSegmentsFromLocal();
  if (local) return local;

  return {
    generatedAt: new Date().toISOString(),
    totalReviews: 0,
    profilesByLens: {
      business: [],
      engagement: [],
      behavior: [],
      context: [],
      pain: [],
    },
    matrixMetrics: [],
    highestFrictionSegment: "—",
    varianceDeltaPct: 0,
    subClusters: [],
    dataSource: "local",
  };
}
