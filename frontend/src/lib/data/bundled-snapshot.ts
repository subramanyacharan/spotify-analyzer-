import insightPrioritization from "../../../data/outputs/insight_prioritization.json";
import segmentDeepDives from "../../../data/outputs/segment_deep_dives.json";
import opportunityScores from "../../../data/outputs/opportunity_scores.json";
import problemStatementInsights from "../../../data/outputs/problem_statement_insights.json";
import dashboardSnapshot from "../../../data/outputs/dashboard_snapshot.json";
import weeklyReport from "../../../data/outputs/weekly_report.json";

/**
 * Phase 3 snapshot shipped with the frontend for Vercel when Supabase is unavailable.
 * Source of truth remains Supabase when reachable; this is a read-only display fallback.
 */
export function getBundledPhase3Themes(): Record<string, unknown> {
  return {
    insight_prioritization: insightPrioritization,
    segment_deep_dives: segmentDeepDives,
    opportunity_scores: opportunityScores,
    problem_statement_insights: problemStatementInsights,
    dashboard_snapshot: dashboardSnapshot,
    weekly_report: weeklyReport,
  };
}
