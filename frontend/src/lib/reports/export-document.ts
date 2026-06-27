import type { MergedWeeklyReport } from "./types";

export interface ExportReportDocument {
  title: string;
  generatedAt: string;
  periodLabel: string;
  weekCount: number;
  totalReviews: number;
  confidenceLevel: string;
  executiveSummary: string;
  methodology: {
    overview: string;
    steps: string[];
    ranking: string;
    prioritization: string;
    confidence: string;
  };
  keyFindings: string[];
  topThemes: { theme: string; count: number }[];
  emergingIssues: { label: string; detail: string }[];
  topPainPoints: { painPoint: string; frequency: number; severity: number }[];
  priorities: { rank: number; title: string; tier: string; why: string }[];
  weeklySnapshots: { label: string; reviewCount: number; negativePct: number }[];
}

export function buildExportReportDocument(
  merged: MergedWeeklyReport,
  prioritization: Record<string, unknown> | null,
  weeklyReport: Record<string, unknown> | null
): ExportReportDocument {
  const matrix = (prioritization?.prioritization_matrix ?? []) as Array<
    Record<string, unknown>
  >;
  const topPriority = prioritization?.top_priority as Record<string, unknown> | undefined;

  const execFromReport =
    (weeklyReport?.sections as Record<string, unknown> | undefined)?.executive_summary as
      | Record<string, unknown>
      | undefined;

  const executiveSummary =
    (execFromReport?.narrative as string) ??
    (topPriority?.recommendation as string) ??
    (topPriority?.title as string) ??
    "User feedback highlights discovery and recommendation quality as the leading product themes this period.";

  const keyFindings: string[] = [];
  const answers = (
    (weeklyReport?.sections as Record<string, unknown> | undefined)?.problem_statement_summary as
      | Record<string, unknown>
      | undefined
  )?.answers as Array<Record<string, unknown>> | undefined;

  if (answers?.length) {
    for (const ans of answers.slice(0, 3)) {
      if (typeof ans.finding_summary === "string") {
        keyFindings.push(ans.finding_summary);
      }
    }
  }

  if (!keyFindings.length && merged.topPainPoints.length) {
    keyFindings.push(
      `Top user pain: ${merged.topPainPoints[0].painPoint.slice(0, 180)}…`
    );
  }

  const priorities = matrix.slice(0, 8).map((item, i) => ({
    rank: (item.rank as number) ?? i + 1,
    title: String(item.title ?? item.pain_point ?? "Priority item"),
    tier: String(item.tier ?? "Monitor"),
    why: String(item.rationale ?? item.recommendation ?? "Based on review volume and negative sentiment."),
  }));

  const emergingIssues = merged.emergingIssues.slice(0, 5).map((e) => ({
    label: e.theme ?? e.painPoint ?? e.type,
    detail: `${e.changePct >= 0 ? "+" : ""}${e.changePct.toFixed(1)}% change vs prior period`,
  }));

  const periodLabel =
    merged.weekLabels.length > 1
      ? `${merged.weekLabels[0]} — ${merged.weekLabels[merged.weekLabels.length - 1]}`
      : merged.weekLabels[0] ?? "Latest period";

  return {
    title: "Growth Intelligence Weekly Report",
    generatedAt: new Date().toISOString(),
    periodLabel,
    weekCount: merged.weekCount,
    totalReviews: merged.totalReviews,
    confidenceLevel: merged.confidenceLevel,
    executiveSummary,
    methodology: {
      overview:
        "This report summarizes patterns in public app store reviews. It does not use private user data or demographics.",
      steps: [
        "We collect recent public reviews from major app stores.",
        "Reviews are grouped by recurring themes (e.g. recommendations, playlists, search).",
        "Sentiment is scored to separate praise from frustration.",
        "Audiences are inferred from how people describe their listening habits in their own words.",
        "Findings are compared week-over-week to spot emerging issues.",
      ],
      ranking:
        "Theme rankings count how often a topic appears across analyzed reviews. Higher counts mean more users are talking about that topic.",
      prioritization:
        "Priority tiers (Critical, High, Monitor) combine three signals: how many reviews mention the issue (frequency), how strongly users express frustration (severity), and how much the issue affects discovery-focused audiences (segment impact). Items with high frequency and high negative sentiment rank highest.",
      confidence:
        "Confidence reflects sample size and consistency of feedback. Large review samples with repeated themes earn higher confidence.",
    },
    keyFindings,
    topThemes: merged.topThemes,
    emergingIssues,
    topPainPoints: merged.topPainPoints.map((p) => ({
      painPoint: p.painPoint,
      frequency: p.frequency,
      severity: p.avgSeverity,
    })),
    priorities,
    weeklySnapshots: merged.snapshotsInRange.map((w) => ({
      label: w.label,
      reviewCount: w.reviewCount,
      negativePct: w.sentiment.negativePct,
    })),
  };
}
