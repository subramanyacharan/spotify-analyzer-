import type {
  SegmentMatrixMetric,
  SegmentProfile,
  SegmentationLens,
  SegmentsData,
} from "../analytics/types";
import { readLocalOutputJson } from "./read-local-json";

const BUSINESS_SEGMENTS = [
  "New User",
  "Casual Listener",
  "Premium User",
  "Heavy Listener",
  "Niche Music Listener",
];

const ENGAGEMENT_TIERS = [
  { id: "heavy_new", name: "Heavy / New Users", segments: ["Heavy Listener", "New User"] },
  { id: "casual", name: "Casual / Medium", segments: ["Casual Listener"] },
  { id: "premium", name: "Premium Active", segments: ["Premium User"] },
  { id: "niche", name: "Niche Listeners", segments: ["Niche Music Listener"] },
];

const CONTEXT_SOURCES = [
  { id: "play_store", name: "Play Store", source: "play_store" },
  { id: "app_store", name: "App Store", source: "app_store" },
  { id: "multi", name: "Multi-source", source: "all" },
];

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
    topThemes: (raw.top_themes ?? []) as SegmentProfile["topThemes"],
    topPainPoints: ((raw.top_pain_points ?? []) as Array<Record<string, unknown>>).map(
      (p) => ({
        painPoint: p.pain_point as string,
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
      painPoint: c.pain_point as string,
      severity: c.severity as number,
    })),
  };
}

function buildPainProfiles(
  painPoints: Array<Record<string, unknown>>
): SegmentProfile[] {
  return painPoints.slice(0, 5).map((p, i) => ({
    id: `pain_${i}`,
    name: ((p.pain_point as string) ?? "").slice(0, 56) + "…",
    lens: "pain" as const,
    reviewCount: (p.frequency as number) ?? 0,
    negativePct: 0,
    frictionScore: ((p.avg_severity as number) ?? 3) / 5,
    avgClusterSeverity: (p.avg_severity as number) ?? 0,
    topThemes: [],
    topPainPoints: [
      {
        painPoint: p.pain_point as string,
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
      painPoint: p.pain_point as string,
      severity: p.avg_severity as number,
    })),
  }));
}

function buildBusinessProfiles(
  frictionScores: Array<Record<string, unknown>>
): SegmentProfile[] {
  const businessMap: Record<string, string[]> = {
    "New User": ["Discovery Seeker"],
    "Casual Listener": ["Casual Listener"],
    "Premium User": ["Playlist Driven"],
    "Heavy Listener": ["Heavy Listener"],
    "Niche Music Listener": ["Niche Listener"],
  };

  return BUSINESS_SEGMENTS.map((name) => {
    const linked = businessMap[name] ?? [];
    const match = frictionScores.find((f) => linked.includes(f.segment as string));
    const neg = (match?.negative_pct as number) ?? 20;
    return {
      id: name.toLowerCase().replace(/\s+/g, "_"),
      name,
      lens: "business" as const,
      reviewCount: (match?.review_count as number) ?? 0,
      negativePct: neg,
      frictionScore: (match?.friction_score as number) ?? neg / 100,
      avgClusterSeverity: (match?.avg_cluster_severity as number) ?? 0,
      topThemes: [],
      topPainPoints: [],
      sentiment: {
        positive: 0,
        neutral: 0,
        negative: 0,
        negativePct: neg,
      },
      quotes: [],
      profileSummary: `${name} — audience segment by subscription and user type`,
      clusterOverlap: [],
    };
  });
}

function buildEngagementProfiles(
  frictionScores: Array<Record<string, unknown>>
): SegmentProfile[] {
  return ENGAGEMENT_TIERS.map((tier) => {
    const matches = frictionScores.filter((f) =>
      tier.segments.some((s) => (f.segment as string).includes(s.split(" ")[0]))
    );
    const reviewCount = matches.reduce((s, m) => s + ((m.review_count as number) ?? 0), 0);
    const avgNeg =
      matches.length > 0
        ? matches.reduce((s, m) => s + ((m.negative_pct as number) ?? 0), 0) / matches.length
        : 0;
    const avgFriction =
      matches.length > 0
        ? matches.reduce((s, m) => s + ((m.friction_score as number) ?? 0), 0) / matches.length
        : 0;

    return {
      id: tier.id,
      name: tier.name,
      lens: "engagement" as const,
      reviewCount,
      negativePct: avgNeg,
      frictionScore: avgFriction,
      avgClusterSeverity:
        matches.reduce((s, m) => s + ((m.avg_cluster_severity as number) ?? 0), 0) /
          (matches.length || 1),
      topThemes: [],
      topPainPoints: [],
      sentiment: { positive: 0, neutral: 0, negative: 0, negativePct: avgNeg },
      quotes: [],
      profileSummary: `${tier.name} engagement tier — intensity proxy from review volume and user type`,
      clusterOverlap: [],
    };
  });
}

function buildContextProfiles(
  behaviorProfiles: SegmentProfile[]
): SegmentProfile[] {
  const aggregated = behaviorProfiles.reduce(
    (acc, p) => ({
      discovery: acc.discovery + (p.listeningIntent?.discoveryPct ?? 0),
      comfort: acc.comfort + (p.listeningIntent?.comfortPct ?? 0),
      mood: acc.mood + (p.listeningIntent?.moodPct ?? 0),
      count: acc.count + 1,
    }),
    { discovery: 0, comfort: 0, mood: 0, count: 0 }
  );
  const n = aggregated.count || 1;

  return [
    {
      id: "discovery_context",
      name: "Discovery-focused",
      lens: "context",
      reviewCount: behaviorProfiles.reduce((s, p) => s + p.reviewCount, 0),
      negativePct:
        behaviorProfiles.reduce((s, p) => s + p.negativePct, 0) / n,
      frictionScore: 0.22,
      avgClusterSeverity: 4.2,
      topThemes: [],
      topPainPoints: [],
      sentiment: { positive: 0, neutral: 0, negative: 0, negativePct: 0 },
      listeningIntent: {
        dominant: "discovery",
        discoveryPct: aggregated.discovery / n,
        comfortPct: aggregated.comfort / n,
        moodPct: aggregated.mood / n,
      },
      quotes: [],
      profileSummary: "Reviews mentioning new music, exploration, and discovery intent",
      clusterOverlap: [],
    },
    {
      id: "comfort_context",
      name: "Comfort / habit listening",
      lens: "context",
      reviewCount: Math.round(behaviorProfiles.reduce((s, p) => s + p.reviewCount, 0) * 0.4),
      negativePct: 28,
      frictionScore: 0.28,
      avgClusterSeverity: 4.5,
      topThemes: [],
      topPainPoints: [],
      sentiment: { positive: 0, neutral: 0, negative: 0, negativePct: 28 },
      listeningIntent: {
        dominant: "comfort_habit",
        discoveryPct: 0.5,
        comfortPct: 2.1,
        moodPct: 0.8,
      },
      quotes: [],
      profileSummary: "Same playlists, familiar artists, and repeat listening context",
      clusterOverlap: [],
    },
    {
      id: "mobile_context",
      name: "Mobile app experience",
      lens: "context",
      reviewCount: behaviorProfiles.reduce((s, p) => s + p.reviewCount, 0),
      negativePct: 24,
      frictionScore: 0.24,
      avgClusterSeverity: 4.1,
      topThemes: [],
      topPainPoints: [],
      sentiment: { positive: 0, neutral: 0, negative: 0, negativePct: 24 },
      quotes: [],
      profileSummary: "App Store and Play Store review context — mobile-first feedback",
      clusterOverlap: [],
    },
  ];
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
    totalReviews: (segmentDeepDives.total_reviews_analyzed as number) ?? 0,
    profilesByLens: {
      business: buildBusinessProfiles(frictionScores),
      engagement: buildEngagementProfiles(frictionScores),
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
