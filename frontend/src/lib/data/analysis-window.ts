/** Rolling analysis window — matches pipeline FULL_INGEST_DAYS / project spec. */
export const ANALYSIS_WINDOW_DAYS = 90;

/** Whole weeks covered by the 90-day analysis window (~13). */
export const ANALYSIS_WINDOW_WEEKS = Math.ceil(ANALYSIS_WINDOW_DAYS / 7);

function toUtcDateIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Inclusive end date for the analysis window (typically last weekly pipeline run). */
export function analysisWindowEndFromAnchor(anchor: Date): string {
  return toUtcDateIso(anchor);
}

/** Inclusive start date — 90 days before the anchor end date. */
export function analysisWindowStartFromAnchor(anchor: Date): string {
  const d = new Date(anchor.getTime());
  d.setUTCDate(d.getUTCDate() - ANALYSIS_WINDOW_DAYS);
  return toUtcDateIso(d);
}

/** @deprecated Prefer analysisWindowStartFromAnchor with the weekly run anchor. */
export function analysisWindowStartIso(): string {
  return analysisWindowStartFromAnchor(new Date());
}

export function analysisWindowLabel(anchor?: string | Date): string {
  if (!anchor) return "Last 90 days";
  const d = typeof anchor === "string" ? new Date(anchor) : anchor;
  if (Number.isNaN(d.getTime())) return "Last 90 days";
  const through = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `Last 90 days · through ${through}`;
}
