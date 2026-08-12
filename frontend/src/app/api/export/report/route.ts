import { NextResponse } from "next/server";
import { getWeeklyReportsCatalog } from "@/lib/data/weekly-reports";
import {
  ANALYSIS_WINDOW_DAYS,
  ANALYSIS_WINDOW_WEEKS,
  analysisWindowLabel,
} from "@/lib/data/analysis-window";
import {
  fetchCanonicalCorpusReviewCount,
  fetchMergedTopThemes,
  pickPayload,
  resolveAnalysisAnchorDate,
} from "@/lib/data/weekly-insights-merge";
import { mergeWeekRange } from "@/lib/reports/merge-weeks";
import { buildExportReportDocument } from "@/lib/reports/export-document";

export async function GET() {
  try {
    const catalog = await getWeeklyReportsCatalog();
    const totalWeeks = catalog.weeks.length;

    if (!totalWeeks) {
      return NextResponse.json(
        { error: "No weekly report data available yet." },
        { status: 404 }
      );
    }

    const toWeek = totalWeeks;
    const fromWeek = Math.max(1, toWeek - ANALYSIS_WINDOW_WEEKS + 1);
    const merged = mergeWeekRange(catalog.weeks, fromWeek, toWeek);

    const themes = await fetchMergedTopThemes();
    const prioritization = pickPayload(themes, "insight_prioritization");
    const weeklyReport = pickPayload(themes, "weekly_report");
    const segmentDeepDives = pickPayload(themes, "segment_deep_dives");
    const opportunities = pickPayload(themes, "opportunity_scores");

    const sources = { prioritization, weeklyReport, segmentDeepDives, opportunities };
    const anchor = await resolveAnalysisAnchorDate(sources);
    const canonicalCount = await fetchCanonicalCorpusReviewCount(sources);

    const document = buildExportReportDocument(
      merged,
      prioritization,
      weeklyReport,
      segmentDeepDives,
      {
        totalReviews: canonicalCount > 0 ? canonicalCount : catalog.corpusReviewCount,
        periodLabel: analysisWindowLabel(anchor),
        analysisWindowDays: ANALYSIS_WINDOW_DAYS,
      }
    );

    return NextResponse.json(
      {
        ...document,
        exportedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Report export failed" }, { status: 500 });
  }
}
