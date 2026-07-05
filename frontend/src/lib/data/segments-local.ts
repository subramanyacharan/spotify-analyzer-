import type {
  SegmentMatrixMetric,
  SegmentProfile,
  SegmentationLens,
  SegmentsData,
} from "../analytics/types";
import { sanitizePainPoint, filterQuotes } from "../copy/sanitize";
import { prepareThemesForDisplay } from "../copy/theme-display";
import { resolveCorpusReviewCount } from "./corpus-metrics";
import { readLocalOutputJson } from "./read-local-json";

const BUSINESS_SEGMENTS = [
  "New User",
  "Casual Listener",
  "Premium User",
  "Heavy Listener",
  "Niche Music Listener",
];

const ENGAGEMENT_TIERS = [
  {
    id: "heavy_new",
    name: "Heavy / New Users",
    segments: ["Heavy Listener", "Discovery Seeker"],
  },
  { id: "casual", name: "Casual / Medium", segments: ["Casual Listener"] },
  {
    id: "playlist_habit",
    name: "Playlist & Habit",
    segments: ["Playlist Driven", "Habit Listener"],
  },
  { id: "niche", name: "Niche Listeners", segments: ["Niche Listener"] },
];

const CONTEXT_INTENT_GROUPS = [
  { id: "discovery_context", name: "Discovery-focused", intent: "discovery" },
  { id: "comfort_context", name: "Comfort / habit listening", intent: "comfort_habit" },
  { id: "mood_context", name: "Mood / context listening", intent: "mood_context" },
] as const;

function frictionBySegment(
  frictionScores: Array<Record<string, unknown>>
): Map<string, Record<string, unknown>> {
  return new Map(
    frictionScores.map((row) => [row.segment as string, row])
  );
}

function sumReviewCount(profiles: SegmentProfile[]): number {
  return profiles.reduce((sum, profile) => sum + profile.reviewCount, 0);
}

function avgField(profiles: SegmentProfile[], field: "negativePct" | "frictionScore"): number {
  if (!profiles.length) return 0;
  return profiles.reduce((sum, profile) => sum + profile[field], 0) / profiles.length;
}

async function readJson<T>(filename: string): Promise<T | null> {
  return readLocalOutputJson<T>(filename);
}

function normalizeBehaviorProfile(raw: Record<string, unknown>): SegmentProfile {
  const sentiment = (raw.sentiment_breakdown ?? {}) as Record<string, number>;
  const intent = (raw.listening_intent_signals ?? {}) as Record<string, unknown>;
  const clusters = (raw.cluster_overlap ?? []) as Array<Record<string, unknown>>;

  return {
    id: (raw.segment as string).toLowerCase().replace(/\s+/g, "_"),
    name: raw.segment as string,
    lens: "behavior",
    reviewCount: raw.review_count as number,
    negativePct: sentiment.negative_pct ?? 0,
    frictionScore: (sentiment.negative_pct ?? 0) / 100,
    avgClusterSeverity: (raw.avg_cluster_severity as number) ?? 0,
    topThemes: prepareThemesForDisplay(
      (raw.top_themes ?? []) as SegmentProfile["topThemes"]
    ),
    topPainPoints: ((raw.top_pain_points ?? []) as Array<Record<string, unknown>>).map(
      (p) => ({
        painPoint: sanitizePainPoint(p.pain_point as string),
        count: p.count as number,
        pct: p.pct as number,
      })
    ),
    sentiment: {
      positive: sentiment.positive ?? 0,
      neutral: sentiment.neutral ?? 0,
      negative: sentiment.negative ?? 0,
      negativePct: sentiment.negative_pct ?? 0,
      avgScore: sentiment.avg_sentiment_score,
    },
    listeningIntent: {
      dominant: (intent.dominant_intent as string) ?? "mixed",
      discoveryPct: (intent.discovery_pct as number) ?? 0,
      comfortPct: (intent.comfort_habit_pct as number) ?? 0,
      moodPct: (intent.mood_context_pct as number) ?? 0,
    },
    quotes: (raw.representative_quotes ?? []) as string[],
    profileSummary: (raw.profile_summary as string) ?? "",
    clusterOverlap: clusters.map((c) => ({
      clusterId: c.cluster_id as number,
      reviewCount: c.review_count as number,
      pct: c.pct as number,
      painPoint: sanitizePainPoint(c.pain_point as string),
      severity: c.severity as number,
    })),
  };
}

function buildPainProfiles(
  painPoints: Array<Record<string, unknown>>
): SegmentProfile[] {
  return painPoints.slice(0, 5).map((p, i) => ({
    id: `pain_${i}`,
    name: sanitizePainPoint((p.pain_point as string) ?? ""),
    lens: "pain" as const,
    reviewCount: (p.frequency as number) ?? 0,
    negativePct: 0,
    frictionScore: ((p.avg_severity as number) ?? 3) / 5,
    avgClusterSeverity: (p.avg_severity as number) ?? 0,
    topThemes: [],
    topPainPoints: [
      {
        painPoint: sanitizePainPoint(p.pain_point as string),
        count: p.frequency as number,
        pct: 100,
      },
    ],
    sentiment: { positive: 0, neutral: 0, negative: 0, negativePct: 0 },
    quotes: [],
    profileSummary: `Issue severity ${p.avg_severity}/5 across ${(p.frequency as number)?.toLocaleString()} reviews`,
    clusterOverlap: ((p.cluster_ids as number[]) ?? []).map((id) => ({
      clusterId: id,
      reviewCount: p.frequency as number,
      pct: 100,
      painPoint: sanitizePainPoint(p.pain_point as string),
      severity: p.avg_severity as number,
    })),
  }));
}

function buildBusinessProfiles(
  behaviorProfiles: SegmentProfile[],
  frictionScores: Array<Record<string, unknown>>
): SegmentProfile[] {
  const friction = frictionBySegment(frictionScores);
  const profileByName = new Map(behaviorProfiles.map((profile) => [profile.name, profile]));
  const businessMap: Record<string, string[]> = {
    "New User": ["Discovery Seeker"],
    "Casual Listener": ["Casual Listener"],
    "Premium User": ["Playlist Driven"],
    "Heavy Listener": ["Heavy Listener"],
    "Niche Music Listener": ["Niche Listener"],
  };

  return BUSINESS_SEGMENTS.map((name) => {
    const linked = businessMap[name] ?? [];
    const profiles = linked
      .map((segment) => profileByName.get(segment))
      .filter((profile): profile is SegmentProfile => Boolean(profile));
    const matchedFriction = linked
      .map((segment) => friction.get(segment))
      .filter((row): row is Record<string, unknown> => Boolean(row));
    const reviewCount = sumReviewCount(profiles);
    const negativePct = avgField(profiles, "negativePct");
    const frictionScore =
      matchedFriction.length > 0
        ? Math.max(...matchedFriction.map((row) => Number(row.friction_score) || 0))
        : avgField(profiles, "frictionScore");

    return {
      id: name.toLowerCase().replace(/\s+/g, "_"),
      name,
      lens: "business" as const,
      reviewCount,
      negativePct,
      frictionScore,
      avgClusterSeverity:
        profiles.reduce((sum, profile) => sum + profile.avgClusterSeverity, 0) /
          (profiles.length || 1),
      topThemes: [],
      topPainPoints: [],
      sentiment: {
        positive: 0,
        neutral: 0,
        negative: 0,
        negativePct,
      },
      quotes: [],
      profileSummary: `${name} — mapped from behavioral segments: ${linked.join(", ") || "none"}`,
      clusterOverlap: [],
    };
  });
}

function buildEngagementProfiles(
  behaviorProfiles: SegmentProfile[],
  frictionScores: Array<Record<string, unknown>>
): SegmentProfile[] {
  const friction = frictionBySegment(frictionScores);

  return ENGAGEMENT_TIERS.map((tier) => {
    const profiles = behaviorProfiles.filter((profile) =>
      tier.segments.includes(profile.name)
    );
    const matchedFriction = tier.segments
      .map((segment) => friction.get(segment))
      .filter((row): row is Record<string, unknown> => Boolean(row));
    const reviewCount = sumReviewCount(profiles);
    const negativePct = avgField(profiles, "negativePct");
    const frictionScore =
      matchedFriction.length > 0
        ? Math.max(...matchedFriction.map((row) => Number(row.friction_score) || 0))
        : avgField(profiles, "frictionScore");

    return {
      id: tier.id,
      name: tier.name,
      lens: "engagement" as const,
      reviewCount,
      negativePct,
      frictionScore,
      avgClusterSeverity:
        profiles.reduce((sum, profile) => sum + profile.avgClusterSeverity, 0) /
          (profiles.length || 1),
      topThemes: [],
      topPainPoints: [],
      sentiment: { positive: 0, neutral: 0, negative: 0, negativePct },
      quotes: [],
      profileSummary: `${tier.name} — ${tier.segments.join(", ")}`,
      clusterOverlap: [],
    };
  });
}

function buildContextProfiles(behaviorProfiles: SegmentProfile[]): SegmentProfile[] {
  return CONTEXT_INTENT_GROUPS.map((group) => {
    const profiles = behaviorProfiles.filter(
      (profile) => profile.listeningIntent?.dominant === group.intent
    );
    const reviewCount = sumReviewCount(profiles);
    const negativePct = avgField(profiles, "negativePct");
    const frictionScore = avgField(profiles, "frictionScore");

    return {
      id: group.id,
      name: group.name,
      lens: "context" as const,
      reviewCount,
      negativePct,
      frictionScore,
      avgClusterSeverity:
        profiles.reduce((sum, profile) => sum + profile.avgClusterSeverity, 0) /
          (profiles.length || 1),
      topThemes: [],
      topPainPoints: [],
      sentiment: { positive: 0, neutral: 0, negative: 0, negativePct },
      listeningIntent: {
        dominant: group.intent,
        discoveryPct: 0,
        comfortPct: 0,
        moodPct: 0,
      },
      quotes: [],
      profileSummary: `${group.name} — reviews grouped by dominant listening intent (${group.intent.replace("_", " ")})`,
      clusterOverlap: [],
    };
  }).filter((profile) => profile.reviewCount > 0);
}

function buildMatrixMetrics(
  behaviorProfiles: SegmentProfile[],
  comparison: Record<string, unknown> | undefined
): SegmentMatrixMetric[] {
  const metrics = (comparison?.segment_metrics ?? {}) as Record<
    string,
    Record<string, number>
  >;

  const normalize = (values: number[]) => {
    const max = Math.max(...values, 1);
    return values.map((v) => Math.round((v / max) * 100) / 100);
  };

  const segNames = behaviorProfiles.map((p) => p.name);
  const repScores = segNames.map(
    (s) => metrics[s]?.repetitive_listening_score ?? 0
  );
  const recScores = segNames.map(
    (s) => metrics[s]?.recommendation_fatigue_score ?? 0
  );
  const discScores = segNames.map((s) => metrics[s]?.discovery_failure_score ?? 0);

  const normRep = normalize(repScores);
  const normRec = normalize(recScores);
  const normDisc = normalize(discScores);

  const buildRow = (key: string, label: string, vals: number[]): SegmentMatrixMetric => ({
    metric: label,
    key,
    values: Object.fromEntries(segNames.map((name, i) => [name, vals[i]])),
  });

  return [
    buildRow(
      "retention",
      "Retention",
      behaviorProfiles.map((p) => 1 - p.negativePct / 100)
    ),
    buildRow(
      "conversion",
      "Conversion",
      behaviorProfiles.map((p) => (p.sentiment.avgScore ?? 3.5) / 5)
    ),
    buildRow("discovery", "Discovery", normDisc),
    buildRow(
      "skips",
      "Skips",
      behaviorProfiles.map((p) => p.negativePct / 100)
    ),
    buildRow("upsell", "Upsell Rec.", normRec),
    buildRow(
      "ltv",
      "LTV",
      normalize(behaviorProfiles.map((p) => Math.log10(p.reviewCount + 1)))
    ),
  ];
}

function churnRisk(negativePct: number): "LOW" | "MEDIUM" | "HIGH" {
  if (negativePct >= 30) return "HIGH";
  if (negativePct >= 20) return "MEDIUM";
  return "LOW";
}

export function parseSegmentsPayload(
  segmentDeepDives: Record<string, unknown>,
  prioritization: Record<string, unknown> | null,
  source: "supabase" | "local"
): SegmentsData {
  const rawProfiles = (segmentDeepDives.segment_profiles ?? []) as Array<
    Record<string, unknown>
  >;
  const behaviorProfiles = rawProfiles.map(normalizeBehaviorProfile);
  const frictionScores = (prioritization?.segment_friction_scores ??
    []) as Array<Record<string, unknown>>;
  const topPain = (prioritization?.top_pain_points ?? []) as Array<
    Record<string, unknown>
  >;
  const comparison = segmentDeepDives.segment_comparison as
    | Record<string, unknown>
    | undefined;

  const sorted = [...behaviorProfiles].sort((a, b) => b.frictionScore - a.frictionScore);
  const top = sorted[0];
  const second = sorted[1];
  const varianceDeltaPct =
    top && second
      ? Math.round(((top.frictionScore - second.frictionScore) / second.frictionScore) * 100)
      : 0;

  return {
    generatedAt:
      (segmentDeepDives.generated_at as string) ?? new Date().toISOString(),
    totalReviews:
      resolveCorpusReviewCount({ segmentDeepDives, prioritization }) ||
      sumReviewCount(behaviorProfiles),
    profilesByLens: {
      business: buildBusinessProfiles(behaviorProfiles, frictionScores),
      engagement: buildEngagementProfiles(behaviorProfiles, frictionScores),
      behavior: behaviorProfiles,
      context: buildContextProfiles(behaviorProfiles),
      pain: buildPainProfiles(topPain),
    },
    matrixMetrics: buildMatrixMetrics(behaviorProfiles, comparison),
    highestFrictionSegment:
      (comparison?.highest_friction_segment as string) ?? top?.name ?? "—",
    varianceDeltaPct,
    subClusters: behaviorProfiles
      .map((p) => ({
        name: p.name,
        reviewCount: p.reviewCount,
        frictionScore: p.frictionScore,
        negativePct: p.negativePct,
        growthTrendPct: Math.round(p.negativePct * 0.5 + 5),
        churnRisk: churnRisk(p.negativePct),
        lens: "behavior" as SegmentationLens,
      }))
      .sort((a, b) => b.reviewCount - a.reviewCount),
    dataSource: source,
  };
}

export async function loadSegmentsFromLocal(): Promise<SegmentsData | null> {
  const [segmentDeepDives, prioritization] = await Promise.all([
    readJson<Record<string, unknown>>("segment_deep_dives.json"),
    readJson<Record<string, unknown>>("insight_prioritization.json"),
  ]);
  if (!segmentDeepDives) return null;
  return parseSegmentsPayload(segmentDeepDives, prioritization, "local");
}
