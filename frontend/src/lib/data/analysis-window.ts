/** Rolling analysis window — matches pipeline FULL_INGEST_DAYS / project spec. */
export const ANALYSIS_WINDOW_DAYS = 90;

/** Whole weeks covered by the 90-day analysis window (~13). */
export const ANALYSIS_WINDOW_WEEKS = Math.ceil(ANALYSIS_WINDOW_DAYS / 7);

export function analysisWindowStartIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - ANALYSIS_WINDOW_DAYS);
  return d.toISOString().slice(0, 10);
}

export function analysisWindowLabel(): string {
  return "Last 90 days";
}
