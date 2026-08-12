import { readLocalOutputJson } from "./read-local-json";

const PHASE3_FILES = {
  insight_prioritization: "insight_prioritization.json",
  segment_deep_dives: "segment_deep_dives.json",
  opportunity_scores: "opportunity_scores.json",
  problem_statement_insights: "problem_statement_insights.json",
  dashboard_snapshot: "dashboard_snapshot.json",
  weekly_report: "weekly_report.json",
} as const;

/** Load Phase 3 payloads from gitignored pipeline JSON on disk (local dev only). */
export async function loadDiskPhase3Themes(): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    Object.entries(PHASE3_FILES).map(async ([key, filename]) => {
      const payload = await readLocalOutputJson<Record<string, unknown>>(filename);
      return [key, payload] as const;
    })
  );

  const themes: Record<string, unknown> = {};
  for (const [key, payload] of entries) {
    if (payload) themes[key] = payload;
  }
  return themes;
}
