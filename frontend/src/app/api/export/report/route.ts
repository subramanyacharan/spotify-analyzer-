import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-guard";
import { getWeeklyReportsCatalog } from "@/lib/data/weekly-reports";
import {
  fetchMergedTopThemes,
  pickPayload,
} from "@/lib/data/weekly-insights-merge";
import { mergeWeekRange } from "@/lib/reports/merge-weeks";
import { buildExportReportDocument } from "@/lib/reports/export-document";

export async function GET(request: Request) {
  const { response } = await requireApiUser();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const weeksParam = parseInt(searchParams.get("weeks") ?? "4", 10);
  const weekCount = Math.min(12, Math.max(1, Number.isFinite(weeksParam) ? weeksParam : 4));

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
    const fromWeek = Math.max(1, toWeek - weekCount + 1);
    const merged = mergeWeekRange(catalog.weeks, fromWeek, toWeek);

    const themes = await fetchMergedTopThemes();
    const prioritization = pickPayload(themes, "insight_prioritization");
    const weeklyReport = pickPayload(themes, "weekly_report");

    const document = buildExportReportDocument(merged, prioritization, weeklyReport);

    return NextResponse.json(
      {
        ...document,
        availableWeeks: totalWeeks,
        exportedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Report export failed" }, { status: 500 });
  }
}
