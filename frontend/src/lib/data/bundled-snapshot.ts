/**
 * Bundled Phase 3 JSON is gitignored (see frontend/data/outputs/).
 * Production reads Supabase; local dev uses loadDiskPhase3Themes().
 */
export function getBundledPhase3Themes(): Record<string, unknown> {
  return {};
}
