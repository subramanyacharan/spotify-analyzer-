import type { AnalyticsData, WeeklySentiment } from "../analytics/types";
import { getWeekStart } from "../analytics/chart-theme";
import { getSupabaseServerClient } from "../supabase/server";
import { fetchMergedTopThemes, fetchCanonicalCorpusReviewCount, pickPayload } from "./weekly-insights-merge";
import { enrichAnalyticsFromSupabase } from "./analytics-supabase";
import { loadAnalyticsFromLocal, parseAnalyticsPayload } from "./analytics-local";

async function fetchWeeklyFromReviews(): Promise<{
  points: WeeklySentiment[];
  source: AnalyticsData["weeklySource"];
}> {
  const client = getSupabaseServerClient();
  if (!client) return { points: [], source: "unavailable" };

  const { data: trends } = await client
    .from("historical_trends")
    .select("week_start, avg_sentiment, mention_count")
    .order("week_start", { ascending: true })
    .limit(52);

  if (trends?.length) {
    const byWeek = new Map<string, { pos: number; neu: number; neg: number }>();
    for (const row of trends) {
      const week = row.week_start as string;
      const bucket = byWeek.get(week) ?? { pos: 0, neu: 0, neg: 0 };
      const avg = Number(row.avg_sentiment ?? 3);
      const count = Number(row.mention_count ?? 0);
      if (avg < 2.5) bucket.neg += count;
      else if (avg > 3.5) bucket.pos += count;
      else bucket.neu += count;
      byWeek.set(week, bucket);
    }
    const points = Array.from(byWeek.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, b]) => {
        const total = b.pos + b.neu + b.neg || 1;
        return {
          week,
          weekLabel: new Date(week).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          }),
          positive: b.pos,
          neutral: b.neu,
          negative: b.neg,
          negativePct: (b.neg / total) * 100,
        };
      });
    return { points, source: "historical_trends" };
  }

  const bucketMap = new Map<string, { pos: number; neu: number; neg: number }>();
  let offset = 0;
  const PAGE = 2000;
  const MAX = 16000;

  while (offset < MAX) {
    const { data } = await client
      .from("processed_reviews")
      .select("sentiment_label, raw_reviews(review_date)")
      .range(offset, offset + PAGE - 1);

    if (!data?.length) break;

    for (const row of data) {
      const raw = row.raw_reviews as { review_date?: string } | null;
      const dateStr = raw?.review_date;
      if (!dateStr) continue;
      const week = getWeekStart(new Date(dateStr));
      const bucket = bucketMap.get(week) ?? { pos: 0, neu: 0, neg: 0 };
      const label = row.sentiment_label as string;
      if (label === "positive") bucket.pos++;
      else if (label === "negative") bucket.neg++;
      else bucket.neu++;
      bucketMap.set(week, bucket);
    }

    if (data.length < PAGE) break;
    offset += PAGE;
  }

  if (bucketMap.size === 0) return { points: [], source: "unavailable" };

  const points = Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-16)
    .map(([week, b]) => {
      const total = b.pos + b.neu + b.neg || 1;
      return {
        week,
        weekLabel: new Date(week).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        positive: b.pos,
        neutral: b.neu,
        negative: b.neg,
        negativePct: (b.neg / total) * 100,
      };
    });

  return { points, source: "review_sample" };
}

export async function getAnalyticsData(): Promise<AnalyticsData> {
  const client = getSupabaseServerClient();

  if (client) {
    try {
      const merged = await fetchMergedTopThemes();
      const problemStatement = pickPayload(merged, "problem_statement_insights");
      const segmentDeepDives = pickPayload(merged, "segment_deep_dives");
      const prioritization = pickPayload(merged, "insight_prioritization");
      const opportunities = pickPayload(merged, "opportunity_scores");

      if (problemStatement?.answers) {
        const weekly = await fetchWeeklyFromReviews();
        const base = parseAnalyticsPayload(
          problemStatement,
          segmentDeepDives ?? null,
          "supabase",
          weekly.source,
          prioritization,
          opportunities
        );
        if (weekly.points.length) base.weeklySentiment = weekly.points;
        const enriched = await enrichAnalyticsFromSupabase(client, base);
        enriched.totalReviews = await fetchCanonicalCorpusReviewCount({
          problemStatement,
          segmentDeepDives,
          prioritization,
          opportunities,
        });
        return enriched;
      }
    } catch {
      /* fall through */
    }
  }

  const local = await loadAnalyticsFromLocal();
  if (local) {
    const weekly = await fetchWeeklyFromReviews();
    if (weekly.points.length) {
      local.weeklySentiment = weekly.points;
      local.weeklySource = weekly.source;
    }
    return local;
  }

  return {
    generatedAt: new Date().toISOString(),
    totalReviews: 0,
    themes: [],
    weeklySentiment: [],
    heatmap: [],
    heatmapSegments: [],
    heatmapThemes: [],
    dataSource: "local",
    weeklySource: "unavailable",
  };
}
