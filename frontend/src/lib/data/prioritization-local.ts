import { sanitizeRecommendation } from "../copy/sanitize";
import type {
  PrioritizationData,
  PrioritizationItem,
  PrioritizationType,
} from "../opportunities/types";
import { TYPE_LABELS } from "../opportunities/types";
import { readLocalOutputJson } from "./read-local-json";

function normalizeItem(raw: Record<string, unknown>): PrioritizationItem {
  const type = raw.type as PrioritizationType;
  const tier = raw.tier as string;
  return {
    rank: raw.rank as number,
    type,
    typeLabel: TYPE_LABELS[type] ?? type,
    title: sanitizeRecommendation(raw.title as string),
    tier: (tier === "Critical" || tier === "High" || tier === "Monitor"
      ? tier
      : "Monitor") as PrioritizationItem["tier"],
    priorityScore: raw.priority_score as number,
    recommendation: sanitizeRecommendation(raw.recommendation as string),
    evidence: (raw.evidence ?? {}) as Record<string, unknown>,
  };
}

export function parsePrioritizationPayload(
  payload: Record<string, unknown>,
  source: "supabase" | "local"
): PrioritizationData {
  const matrix = (payload.prioritization_matrix ?? []) as Array<Record<string, unknown>>;
  const items = matrix.map(normalizeItem).sort((a, b) => a.rank - b.rank);
  const topRaw = payload.top_priority as Record<string, unknown> | undefined;

  return {
    generatedAt: (payload.generated_at as string) ?? new Date().toISOString(),
    totalReviews: (payload.total_reviews_analyzed as number) ?? 0,
    tierSummary: (payload.tier_summary ?? {}) as Record<string, number>,
    items,
    topPriority: topRaw ? normalizeItem(topRaw) : items[0] ?? null,
    dataSource: source,
  };
}

export async function loadPrioritizationFromLocal(): Promise<PrioritizationData | null> {
  const payload = await readLocalOutputJson<Record<string, unknown>>(
    "insight_prioritization.json"
  );
  if (!payload) return null;
  return parsePrioritizationPayload(payload, "local");
}
