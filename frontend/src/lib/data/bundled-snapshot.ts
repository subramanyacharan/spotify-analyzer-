/**
 * Optional bundled Phase 3 fallback. Snapshot JSON lives locally under
 * frontend/data/outputs/ (gitignored) and is synced by the pipeline script.
 * Production reads Supabase via the server-side service role.
 */
export function getBundledPhase3Themes(): Record<string, unknown> {
  return {};
}
