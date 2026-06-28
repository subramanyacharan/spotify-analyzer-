/** Phase 3 behavioral segment mapping (mirrors problem_statement_engine.py). */

const PHASE2_SEGMENT_MAP: Record<string, string> = {
  "New User": "Discovery Seeker",
  "Premium User": "Habit Listener",
  "Heavy Listener": "Heavy Listener",
  "Niche Music Listener": "Niche Listener",
  "Casual Listener": "Casual Listener",
};

const PLAYLIST_PATTERN =
  /\b(playlist|discover weekly|daily mix|release radar|my mix|liked songs)\b/i;
const DISCOVERY_PATTERN =
  /\b(discover|explore|find new|recommendation|suggest|algorithm)\b/i;

export function normalizeBehavioralSegment(
  userSegment: string,
  cleanedText = "",
  themes: string[] = []
): string {
  const text = cleanedText.toLowerCase();
  const themeStr = themes.join(" ").toLowerCase();

  if (PLAYLIST_PATTERN.test(text) || themeStr.includes("playlist")) {
    return "Playlist Driven";
  }
  if (DISCOVERY_PATTERN.test(text) || themeStr.includes("discover")) {
    return "Discovery Seeker";
  }

  return PHASE2_SEGMENT_MAP[userSegment] ?? "Casual Listener";
}

export function parseReviewThemes(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return [raw];
    }
  }
  return [String(raw)];
}
