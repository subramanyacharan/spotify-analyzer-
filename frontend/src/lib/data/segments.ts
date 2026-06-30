import type { SegmentsData } from "../analytics/types";
import {
  fetchCanonicalCorpusReviewCount,
  fetchMergedTopThemes,
  pickPayload,
  resolveDashboardGeneratedAt,
} from "./weekly-insights-merge";
import { loadSegmentsFromLocal, parseSegmentsPayload } from "./segments-local";

export async function getSegmentsData(): Promise<SegmentsData> {
  try {
    const merged = await fetchMergedTopThemes();
    const segmentDeepDives = pickPayload(merged, "segment_deep_dives");
    const prioritization = pickPayload(merged, "insight_prioritization");
    const weeklyReport = pickPayload(merged, "weekly_report");

    if (segmentDeepDives?.segment_profiles) {
      const sources = { segmentDeepDives, prioritization, weeklyReport };
      const data = parseSegmentsPayload(segmentDeepDives, prioritization ?? null, "supabase");
      data.totalReviews = await fetchCanonicalCorpusReviewCount(sources);
      data.generatedAt = await resolveDashboardGeneratedAt(sources);
      return data;
    }
  } catch (e) {
    console.error("[segments] snapshot load failed:", e);
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
