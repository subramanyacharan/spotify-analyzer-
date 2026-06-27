import type { SegmentsData } from "../analytics/types";
import { getSupabaseServerClient } from "../supabase/server";
import { loadSegmentsFromLocal, parseSegmentsPayload } from "./segments-local";

export async function getSegmentsData(): Promise<SegmentsData> {
  const client = getSupabaseServerClient();

  if (client) {
    try {
      const { data: rows } = await client
        .from("weekly_insights")
        .select("top_themes")
        .order("created_at", { ascending: false })
        .limit(1);

      const topThemes = rows?.[0]?.top_themes as Record<string, unknown> | undefined;
      const segmentDeepDives = topThemes?.segment_deep_dives as
        | Record<string, unknown>
        | undefined;
      const prioritization = topThemes?.insight_prioritization as
        | Record<string, unknown>
        | undefined;

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
