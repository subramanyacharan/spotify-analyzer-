/** Theme labels — canonical project taxonomy + legacy alias support. */

export const GENERAL_APP_THEME = "General App Feedback";
export const LEGACY_GENERAL_THEME = "Unrelated to Discovery";

/** Full Phase 2/3 theme taxonomy — used for heatmaps and analytics charts. */
export const PROJECT_THEME_TAXONOMY = [
  "Repetitive Recommendations",
  "Discover Weekly Issues",
  "Niche Music Gap",
  "Playlist Fatigue",
  "Algorithm Bias",
  "Recommendation Quality",
  "Search & Discovery UX",
  GENERAL_APP_THEME,
] as const;

const DISPLAY_NAMES: Record<string, string> = {
  [LEGACY_GENERAL_THEME]: GENERAL_APP_THEME,
};

export function canonicalThemeName(theme: string | undefined | null): string {
  if (!theme?.trim()) return theme ?? "";
  return DISPLAY_NAMES[theme] ?? theme;
}

export function displayThemeName(theme: string | undefined | null): string {
  const canonical = canonicalThemeName(theme);
  return canonical?.trim() || "—";
}

/** Replace legacy theme labels in free-text analyzer output. */
export function replaceLegacyThemeText(text: string): string {
  if (!text?.trim()) return text;
  return text.replace(new RegExp(LEGACY_GENERAL_THEME, "gi"), GENERAL_APP_THEME);
}

export function themesMatch(filterTheme: string, dataTheme: string): boolean {
  const a = canonicalThemeName(filterTheme).toLowerCase();
  const b = canonicalThemeName(dataTheme).toLowerCase();
  if (a === b) return true;
  return (
    b.includes(a) ||
    a.includes(b.split(" ")[0]) ||
    filterTheme.toLowerCase().includes(b.split(" ")[0])
  );
}

export function prepareThemesForDisplay<T extends { theme: string; count?: number }>(
  themes: T[],
  limit?: number
): T[] {
  const sorted = [...themes]
    .map((t) => ({ ...t, theme: displayThemeName(t.theme) }))
    .sort(
      (a, b) => (b.count ?? 0) - (a.count ?? 0) || a.theme.localeCompare(b.theme)
    );
  return limit !== undefined ? sorted.slice(0, limit) : sorted;
}

/** @deprecated Use prepareThemesForDisplay */
export function filterThemesForDisplay<T extends { theme: string; count?: number }>(
  themes: T[],
  limit?: number
): T[] {
  return prepareThemesForDisplay(themes, limit);
}

export function filterThemeNames(themes: string[]): string[] {
  return themes.map((t) => displayThemeName(t)).filter(Boolean);
}
