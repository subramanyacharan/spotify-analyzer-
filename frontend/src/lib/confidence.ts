import type { ConfidenceInput, ConfidenceLevel } from "./types";

export function computeConfidence(input: ConfidenceInput): {
  level: ConfidenceLevel;
  factors: string[];
} {
  const factors: string[] = [];
  let score = 0;

  if (input.reviewCount >= 1000) {
    score += 2;
    factors.push(`Large sample (${input.reviewCount.toLocaleString()} reviews)`);
  } else if (input.reviewCount >= 100) {
    score += 1;
    factors.push(`Moderate sample (${input.reviewCount.toLocaleString()} reviews)`);
  } else {
    factors.push(`Limited sample (${input.reviewCount} reviews)`);
  }

  if (input.avgClusterSeverity !== undefined && input.avgClusterSeverity >= 4) {
    score += 1;
    factors.push(`High issue severity (${input.avgClusterSeverity.toFixed(1)}/5)`);
  }

  if (input.negativePct !== undefined && input.negativePct > 20) {
    score += 1;
    factors.push(`Consistent negative feedback (${input.negativePct.toFixed(1)}%)`);
  }

  if ((input.quoteCount ?? 0) >= 2 && input.hasClusterInsight) {
    score += 1;
    factors.push("Multiple quotes and supporting evidence");
  } else if ((input.quoteCount ?? 0) >= 2) {
    factors.push("Representative user quotes included");
  }

  let level: ConfidenceLevel = "Low";
  if (score >= 4) level = "High";
  else if (score >= 2) level = "Medium";

  return { level, factors };
}
