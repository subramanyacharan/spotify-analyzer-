/** Theme labels for dashboard display — full project taxonomy, user-friendly names. */

export const INTERNAL_THEME = "Unrelated to Discovery";

const DISPLAY_NAMES: Record<string, string> = {
  [INTERNAL_THEME]: "General App Feedback",
};

export function displayThemeName(theme: string | undefined | null): string {
  if (!theme?.trim()) return "—";
  return DISPLAY_NAMES[theme] ?? theme;
}

export function prepareThemesForDisplay<T extends { theme: string; count?: number }>(
  themes: T[],
  limit?: number
): T[] {
  const sorted = [...themes].sort(
    (a, b) => (b.count ?? 0) - (a.count ?? 0) || a.theme.localeCompare(b.theme)
  );
  return limit !== undefined ? sorted.slice(0, limit) : sorted;
}

/** @deprecated Use prepareThemesForDisplay — kept for gradual migration */
export function filterThemesForDisplay<T extends { theme: string; count?: number }>(
  themes: T[],
  limit?: number
): T[] {
  return prepareThemesForDisplay(themes, limit);
}

export function filterThemeNames(themes: string[]): string[] {
  return themes.filter((t) => t?.trim());
}
