/** Neutralize brand-specific, blame-oriented, or pipeline jargon for dashboard display. */

const RECOMMENDATION_PREFIX =
  /^(?:Spotify(?:'s team)?|The product team)\s+could\s+/i;

const TECHNICAL_PAIN_PATTERNS: Array<[RegExp, string]> = [
  [/Cluster\s+\d+:\s*LLM extraction failed\.?/gi, "Users reported a recurring issue in this theme"],
  [/LLM extraction failed\.?/gi, ""],
  [/^Cluster\s+\d+[:.]?\s*/i, ""],
  [/Manual review required\.?/gi, "Improve how this area surfaces in the product"],
  [/Review cluster manually\.?/gi, "Investigate this theme with product and support teams"],
];

export function sanitizePainPoint(text: string): string {
  if (!text?.trim()) return text;
  let cleaned = text.trim();
  for (const [pattern, replacement] of TECHNICAL_PAIN_PATTERNS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  if (cleaned && !/[.!?]$/.test(cleaned)) cleaned += ".";
  return cleaned;
}

export function filterQuotes(quotes: string[]): string[] {
  return (quotes ?? []).map((q) => q?.trim() ?? "").filter(Boolean);
}

export function sanitizeRecommendation(text: string): string {
  if (!text?.trim()) return text;
  let cleaned = text.trim().replace(RECOMMENDATION_PREFIX, "");
  cleaned = sanitizePainPoint(cleaned);
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  if (cleaned && !/[.!?]$/.test(cleaned)) cleaned += ".";
  return cleaned;
}

export function sanitizeInsightSummary(text: string): string {
  if (!text?.trim()) return text;
  return sanitizePainPoint(
    text
      .replace(/\bSpotify(?:'s team)?\s+(?:could|should|must|needs to)\b/gi, "Users suggest")
      .replace(/\bSpotify is not able to\b/gi, "Users report difficulty with")
      .replace(/\bSpotify can change\b/gi, "A possible improvement is to")
  );
}

/** User quotes are shown verbatim unless they are empty. */
export function sanitizeQuote(text: string): string {
  return text?.trim() ?? "";
}
