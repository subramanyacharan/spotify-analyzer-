/** Neutralize brand-specific or blame-oriented generated copy for dashboard display. */

const RECOMMENDATION_PREFIX =
  /^(?:Spotify(?:'s team)?|The product team)\s+could\s+/i;

export function sanitizeRecommendation(text: string): string {
  if (!text?.trim()) return text;
  let cleaned = text.trim().replace(RECOMMENDATION_PREFIX, "");
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  if (!/[.!?]$/.test(cleaned)) cleaned += ".";
  return cleaned;
}

export function sanitizeInsightSummary(text: string): string {
  if (!text?.trim()) return text;
  return text
    .replace(/\bSpotify(?:'s team)?\s+(?:could|should|must|needs to)\b/gi, "Users suggest")
    .replace(/\bSpotify is not able to\b/gi, "Users report difficulty with")
    .replace(/\bSpotify can change\b/gi, "A possible improvement is to");
}

/** User quotes are shown verbatim unless they are empty. */
export function sanitizeQuote(text: string): string {
  return text?.trim() ?? "";
}
