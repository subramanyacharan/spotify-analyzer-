import { defineSegment, defineTheme } from "./segment-definitions";
import {
  prepareThemesForDisplay,
  displayThemeName,
  filterThemeNames,
} from "../copy/theme-display";
import { sanitizeInsightSummary } from "../copy/sanitize";
import type { MergedWeeklyReport } from "./types";

export interface ReportMetric {
  label: string;
  value: string;
  hint?: string;
}

export interface RankedSegment {
  rank: number;
  name: string;
  definition: string;
  reviewCount: number;
  reviewVolumePct: number;
  sentimentScore: number;
  negativePct: number;
  painScore: number;
  complaintFrequencyPct: number;
  businessImpactScore: number;
  rankingScore: number;
  rankingProof: string;
  topThemes: string[];
  topPainSummary: string;
}

export interface SegmentBreakdown {
  name: string;
  definition: string;
  metrics: ReportMetric[];
  rankingProof: string;
  topThemes: { theme: string; definition: string; count: number; pct: number }[];
  topPains: { summary: string; count: number; pct: number }[];
  discoverySignals: string;
  sampleQuote?: string;
}

export interface RankedPainPoint {
  rank: number;
  label: string;
  painPoint: string;
  reviewCount: number;
  complaintFrequencyPct: number;
  painScore: number;
  sentimentIntensity: number;
  rankingScore: number;
  rankingProof: string;
  relatedThemes: string[];
  tier: string;
}

export interface RankedTheme {
  rank: number;
  theme: string;
  definition: string;
  frequency: number;
  frequencyPct: number;
  sentimentPct: number;
  painLevel: number;
  rankingProof: string;
}

export interface DiscoveryBehaviorRow {
  rank: number;
  segment: string;
  definition: string;
  volumePct: number;
  reviewCount: number;
  painLevel: number;
  negativePct: number;
  priorityScore: number;
  rankingProof: string;
}

export interface CrossSegmentInsight {
  combination: string;
  reviewVolumePct: number;
  painLevel: number;
  impactScore: number;
  rankingProof: string;
  metrics: ReportMetric[];
}

export interface RankedOpportunity {
  rank: number;
  name: string;
  impactScore: number;
  priorityLevel: string;
  supportingMetrics: ReportMetric[];
  rankingProof: string;
}

export interface FinalInsightItem {
  category: string;
  insight: string;
  proof: string;
}

export interface ExportReportDocument {
  meta: {
    title: string;
    subtitle: string;
    generatedAt: string;
    periodLabel: string;
    weekCount: number;
    totalReviews: number;
    confidenceLevel: string;
    confidenceNote: string;
  };
  executiveSummary: {
    headline: string;
    narrative: string;
    proofPoints: string[];
    scorecards: ReportMetric[];
  };
  rankedSegments: RankedSegment[];
  segmentBreakdowns: SegmentBreakdown[];
  rankedThemes: RankedTheme[];
  rankedPainPoints: RankedPainPoint[];
  discoveryBehavior: DiscoveryBehaviorRow[];
  crossAnalysis: CrossSegmentInsight[];
  keyOpportunities: RankedOpportunity[];
  finalInsightsSummary: {
    headline: string;
    findings: FinalInsightItem[];
    corpusMetrics: ReportMetric[];
  };
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function round(n: number, d = 2): number {
  const m = 10 ** d;
  return Math.round(n * m) / m;
}

/** Strip recommendation-style phrasing from analyzer text used in insight-only report sections. */
function insightOnly(text: string): string {
  if (!text?.trim()) return "";
  const cleaned = sanitizeInsightSummary(text);
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => {
    const lower = s.toLowerCase();
    return (
      !/\b(should|could improve|recommend|suggest|fix|ship|prioritize|next step|action:|team could)\b/.test(
        lower
      ) && s.trim().length > 12
    );
  });
  return (kept.length ? kept : [cleaned]).join(" ").trim();
}

function shortPainLabel(painPoint: string): string {
  const lower = painPoint.toLowerCase();
  if (/repetitive|same (artist|song)|limited music recommendation/.test(lower)) {
    return "Repetitive recommendations";
  }
  if (/same artist|artist.*repeat|repeat.*artist/.test(lower)) {
    return "Same artists repeated";
  }
  if (/discovery|discover weekly|find new|explore/.test(lower) && /poor|fail|frustrat/.test(lower)) {
    return "Poor discovery";
  }
  if (/playlist fatigue|stale playlist|playlist.*repeat/.test(lower)) {
    return "Playlist fatigue";
  }
  if (/generic|irrelevant|poor recommendation|limited recommendation/.test(lower)) {
    return "Generic recommendations";
  }
  if (/widget/.test(lower)) return "Widget functionality";
  if (/search/.test(lower)) return "Search and discovery UX";
  return painPoint.length > 72 ? `${painPoint.slice(0, 70)}…` : painPoint;
}

function intentLabel(dominant: string): string {
  if (dominant === "discovery") return "Discovery-oriented listening";
  if (dominant === "comfort" || dominant === "comfort_habit") return "Habit and comfort listening";
  if (dominant === "mood_context") return "Mood-driven listening";
  return "Mixed listening intent";
}

function buildSegmentRankingProof(
  rank: number,
  name: string,
  cur: RankedSegment,
  prev: RankedSegment | null,
  totalReviews: number
): string {
  const volLabel = `${cur.reviewVolumePct}% of ${totalReviews.toLocaleString()} reviews`;
  if (rank === 1) {
    return (
      `${name} ranks #1 with ranking score ${cur.rankingScore.toFixed(2)} — the highest in this period. ` +
      `Evidence: ${volLabel}, ${cur.negativePct.toFixed(1)}% negative sentiment, pain score ${cur.painScore.toFixed(1)}/5, ` +
      `complaint frequency ${cur.complaintFrequencyPct.toFixed(1)}%, business impact score ${cur.businessImpactScore.toFixed(2)}.`
    );
  }
  if (prev) {
    const scoreGap = round(prev.rankingScore - cur.rankingScore, 4);
    return (
      `${name} ranks #${rank} (score ${cur.rankingScore.toFixed(2)}) below #${rank - 1} ${prev.name} ` +
      `(score ${prev.rankingScore.toFixed(2)}, gap ${scoreGap.toFixed(2)}). ` +
      `${name} has ${volLabel}, ${cur.negativePct.toFixed(1)}% negative sentiment, and pain score ${cur.painScore.toFixed(1)}/5.`
    );
  }
  return `${name} ranks #${rank} based on friction score, review volume, and negative sentiment in ${totalReviews.toLocaleString()} analyzed reviews.`;
}

function buildPainRankingProof(
  rank: number,
  pain: RankedPainPoint,
  prev: RankedPainPoint | null,
  totalReviews: number
): string {
  if (rank === 1) {
    return (
      `Ranked #1: ${pain.reviewCount.toLocaleString()} reviews (${pain.complaintFrequencyPct.toFixed(1)}% of corpus) ` +
      `with pain score ${pain.painScore.toFixed(1)}/5 and priority score ${pain.rankingScore.toFixed(2)} — ` +
      `the highest frequency × severity combination among ${totalReviews.toLocaleString()} reviews.`
    );
  }
  if (prev) {
    return (
      `Ranked #${rank} with ${pain.reviewCount.toLocaleString()} mentions vs #${rank - 1} ${prev.label} at ${prev.reviewCount.toLocaleString()}. ` +
      `Pain score ${pain.painScore.toFixed(1)}/5 and priority ${pain.rankingScore.toFixed(2)} place it below the higher-ranked item.`
    );
  }
  return `Ranked #${rank} by impact score (complaint frequency × severity) across the review corpus.`;
}

function aggregateThemeMetrics(
  profiles: Array<Record<string, unknown>>,
  corpusThemes: { theme: string; count: number }[],
  fallbackNegativePct: number
): Map<string, { count: number; weightedNegative: number; weight: number; maxPain: number }> {
  const map = new Map<
    string,
    { count: number; weightedNegative: number; weight: number; maxPain: number }
  >();

  for (const t of corpusThemes) {
    const name = displayThemeName(t.theme);
    map.set(name, { count: t.count, weightedNegative: 0, weight: 0, maxPain: 0 });
  }

  for (const profile of profiles) {
    const negPct = ((profile.sentiment_breakdown ?? {}) as Record<string, number>).negative_pct ?? 0;
    const pain = (profile.avg_cluster_severity as number) ?? 0;
    const themes = (profile.top_themes ?? []) as Array<{ theme: string; count: number }>;
    for (const t of themes) {
      const name = displayThemeName(t.theme);
      const entry = map.get(name) ?? { count: 0, weightedNegative: 0, weight: 0, maxPain: 0 };
      entry.count = Math.max(entry.count, t.count);
      entry.weightedNegative += negPct * t.count;
      entry.weight += t.count;
      entry.maxPain = Math.max(entry.maxPain, pain);
      map.set(name, entry);
    }
  }

  for (const t of corpusThemes) {
    const name = displayThemeName(t.theme);
    const entry = map.get(name);
    if (entry && entry.weight === 0) {
      entry.weightedNegative = fallbackNegativePct * t.count;
      entry.weight = t.count;
      entry.maxPain = entry.maxPain || 3.5;
    }
  }

  return map;
}

function buildCrossSegmentInsights(
  opportunities: Array<Record<string, unknown>>,
  rankedSegments: RankedSegment[],
  profileByName: Map<string, Record<string, unknown>>,
  segmentComparison: Record<string, unknown> | undefined,
  totalReviews: number
): CrossSegmentInsight[] {
  const insights: CrossSegmentInsight[] = [];

  for (const opp of opportunities.slice(0, 4)) {
    const evidence = (opp.evidence ?? {}) as Record<string, unknown>;
    const segBreak = (evidence.segment_breakdown ?? []) as Array<Record<string, unknown>>;
    const themeBreak = (evidence.theme_breakdown ?? []) as Array<Record<string, unknown>>;
    const topSeg = (segBreak[0]?.segment as string) ?? "Unknown segment";
    const topThemes = themeBreak.slice(0, 2).map((t) => displayThemeName(t.theme as string));
    const profile = profileByName.get(topSeg);
    const intent = (profile?.listening_intent_signals ?? {}) as Record<string, unknown>;
    const intentPart = intentLabel(String(intent.dominant_intent ?? "mixed"));
    const themePart = topThemes.length ? topThemes.join(" + ") : "General feedback";
    const reviewCount = (opp.review_count as number) ?? (segBreak[0]?.count as number) ?? 0;
    const scores = (opp.scores ?? {}) as Record<string, number>;
    const composite = scores.composite ?? 0;
    const painLevel = round((scores.severity ?? 0.5) * 5, 1);

    insights.push({
      combination: `${topSeg} + ${intentPart} + ${themePart}`,
      reviewVolumePct: pct(reviewCount, totalReviews),
      painLevel,
      impactScore: round(composite * 100, 2),
      rankingProof:
        `${reviewCount.toLocaleString()} reviews (${pct(reviewCount, totalReviews)}% of corpus) link this segment–behavior–theme combination. ` +
        `Composite impact score ${round(composite * 100, 2)}; severity signal ${painLevel}/5.`,
      metrics: [
        { label: "Reviews", value: reviewCount.toLocaleString() },
        { label: "Volume share", value: `${pct(reviewCount, totalReviews)}%` },
        { label: "Pain level", value: `${painLevel}/5` },
        { label: "Impact score", value: round(composite * 100, 2).toFixed(2) },
      ],
    });
  }

  if (rankedSegments.length >= 2 && insights.length < 6) {
    const comp = segmentComparison ?? {};
    const fatigueRank = (comp.recommendation_fatigue_ranking ?? []) as Array<Record<string, unknown>>;
    const topFatigue = fatigueRank[0] as Record<string, unknown> | undefined;
    if (topFatigue) {
      const segName = topFatigue.segment as string;
      const profile = profileByName.get(segName);
      const themes = filterThemeNames(
        ((profile?.top_themes ?? []) as Array<{ theme: string }>).slice(0, 1).map((t) => t.theme)
      );
      const seg = rankedSegments.find((s) => s.name === segName) ?? rankedSegments[0];
      insights.push({
        combination: `${segName} + Recommendation fatigue pattern + ${themes[0] ?? "Recommendation Quality"}`,
        reviewVolumePct: seg.reviewVolumePct,
        painLevel: seg.painScore,
        impactScore: round(topFatigue.score as number, 0),
        rankingProof:
          `${segName} leads recommendation-fatigue signals with score ${round(topFatigue.score as number, 0)} ` +
          `across ${(topFatigue.review_count as number)?.toLocaleString()} reviews (${seg.reviewVolumePct}% of corpus).`,
        metrics: [
          { label: "Segment volume", value: `${seg.reviewVolumePct}%` },
          { label: "Negative sentiment", value: `${seg.negativePct}%` },
          { label: "Pain score", value: `${seg.painScore}/5` },
          { label: "Fatigue score", value: String(round(topFatigue.score as number, 0)) },
        ],
      });
    }
  }

  return insights.slice(0, 6);
}

export function buildExportReportDocument(
  merged: MergedWeeklyReport,
  prioritization: Record<string, unknown> | null,
  weeklyReport: Record<string, unknown> | null,
  segmentDeepDives: Record<string, unknown> | null
): ExportReportDocument {
  const totalReviews =
    (prioritization?.total_reviews_analyzed as number) ??
    (segmentDeepDives?.total_reviews_analyzed as number) ??
    merged.totalReviews;

  const frictionScores = (
    (prioritization?.segment_friction_scores ?? []) as Array<Record<string, unknown>>
  ).sort((a, b) => (b.friction_score as number) - (a.friction_score as number));

  const rawProfiles = (segmentDeepDives?.segment_profiles ?? []) as Array<Record<string, unknown>>;
  const profileByName = new Map(rawProfiles.map((p) => [p.segment as string, p]));
  const segmentComparison = segmentDeepDives?.segment_comparison as
    | Record<string, unknown>
    | undefined;

  const rankedSegments: RankedSegment[] = frictionScores.map((fs, i) => {
    const name = fs.segment as string;
    const profile = profileByName.get(name);
    const reviewCount = (fs.review_count as number) ?? 0;
    const negativePct = (fs.negative_pct as number) ?? 0;
    const frictionScore = (fs.friction_score as number) ?? 0;
    const reviewVolumePct = pct(reviewCount, totalReviews);
    const sentiment = (profile?.sentiment_breakdown ?? {}) as Record<string, number>;
    const sentimentScore = sentiment.avg_sentiment_score ?? round(5 - (negativePct / 100) * 2, 2);
    const painScore = (fs.avg_cluster_severity as number) ?? (profile?.avg_cluster_severity as number) ?? 0;
    const topThemesRaw = (profile?.top_themes ?? []) as Array<Record<string, unknown>>;
    const topPainRaw = (profile?.top_pain_points ?? []) as Array<Record<string, unknown>>;
    const topPainCount = (topPainRaw[0]?.count as number) ?? 0;
    const complaintFrequencyPct = pct(topPainCount, reviewCount || 1);

    return {
      rank: i + 1,
      name,
      definition: defineSegment(name),
      reviewCount,
      reviewVolumePct,
      sentimentScore: round(sentimentScore, 2),
      negativePct: round(negativePct, 1),
      painScore: round(painScore, 1),
      complaintFrequencyPct,
      businessImpactScore: round(frictionScore * reviewVolumePct, 2),
      rankingScore: round(frictionScore, 4),
      rankingProof: "",
      topThemes: filterThemeNames(topThemesRaw.slice(0, 3).map((t) => t.theme as string)),
      topPainSummary: insightOnly((topPainRaw[0]?.pain_point as string) ?? "").slice(0, 160) || "—",
    };
  });

  rankedSegments.forEach((seg, i) => {
    seg.rankingProof = buildSegmentRankingProof(
      seg.rank,
      seg.name,
      seg,
      i > 0 ? rankedSegments[i - 1] : null,
      totalReviews
    );
  });

  const segmentBreakdowns: SegmentBreakdown[] = rankedSegments.map((seg) => {
    const profile = profileByName.get(seg.name);
    const topThemes = prepareThemesForDisplay(
      ((profile?.top_themes ?? []) as Array<Record<string, unknown>>).map((t) => ({
        theme: t.theme as string,
        count: (t.count as number) ?? 0,
        pct: (t.pct as number) ?? 0,
      })),
      4
    );
    const topPains = ((profile?.top_pain_points ?? []) as Array<Record<string, unknown>>).slice(0, 3);
    const intent = (profile?.listening_intent_signals ?? {}) as Record<string, unknown>;
    const quotes = (profile?.representative_quotes ?? []) as string[];

    const discoverySignals = intent.dominant_intent
      ? `Listening intent: ${intentLabel(String(intent.dominant_intent))}. Discovery language in ${intent.discovery_pct ?? 0}% of reviews; comfort/habit in ${intent.comfort_habit_pct ?? 0}%; mood/context in ${intent.mood_context_pct ?? 0}%.`
      : "Listening intent inferred from review language patterns in this cohort.";

    return {
      name: seg.name,
      definition: seg.definition,
      metrics: [
        {
          label: "Review volume %",
          value: `${seg.reviewVolumePct}%`,
          hint: `${seg.reviewCount.toLocaleString()} of ${totalReviews.toLocaleString()} reviews`,
        },
        {
          label: "Sentiment score",
          value: `${seg.sentimentScore}/5`,
          hint: "Average tone in reviews (higher = more positive)",
        },
        {
          label: "Pain score",
          value: `${seg.painScore}/5`,
          hint: "Average severity of cited product issues",
        },
        {
          label: "Complaint frequency",
          value: `${seg.complaintFrequencyPct}%`,
          hint: "Share of cohort reviews citing the top pain cluster",
        },
        {
          label: "Business impact score",
          value: seg.businessImpactScore.toFixed(2),
          hint: "Friction score weighted by review volume share",
        },
        {
          label: "Ranking score",
          value: seg.rankingScore.toFixed(2),
          hint: "Friction index used for segment rank (higher = higher friction)",
        },
      ],
      rankingProof: seg.rankingProof,
      topThemes: topThemes.map((t) => {
        const raw = ((profile?.top_themes ?? []) as Array<Record<string, unknown>>).find(
          (rt) => displayThemeName(rt.theme as string) === t.theme
        );
        return {
          theme: t.theme,
          definition: defineTheme(t.theme),
          count: t.count ?? 0,
          pct: round((raw?.pct as number) ?? pct(t.count ?? 0, seg.reviewCount || 1), 1),
        };
      }),
      topPains: topPains.map((p) => ({
        summary: insightOnly((p.pain_point as string).slice(0, 140)),
        count: p.count as number,
        pct: round(p.pct as number, 1),
      })),
      discoverySignals,
      sampleQuote: quotes[0]?.slice(0, 200),
    };
  });

  const themeMetricsMap = aggregateThemeMetrics(
    rawProfiles,
    merged.topThemes,
    merged.sentiment.negativePct
  );
  const displayThemes = prepareThemesForDisplay(merged.topThemes, 8);
  const rankedThemes: RankedTheme[] = displayThemes.map((t, i) => {
    const name = displayThemeName(t.theme);
    const agg = themeMetricsMap.get(name);
    const sentimentPct = agg?.weight
      ? round(agg.weightedNegative / agg.weight, 1)
      : round(merged.sentiment.negativePct, 1);
    const painLevel = round(agg?.maxPain ?? 3.5, 1);
    const frequencyPct = pct(t.count, totalReviews);
    const prev = i > 0 ? displayThemes[i - 1] : null;

    return {
      rank: i + 1,
      theme: name,
      definition: defineTheme(name),
      frequency: t.count,
      frequencyPct,
      sentimentPct,
      painLevel,
      rankingProof:
        i === 0
          ? `${name} ranks #1 with ${t.count.toLocaleString()} mentions (${frequencyPct}% of corpus), ${sentimentPct}% negative sentiment among citing reviews, pain level ${painLevel}/5.`
          : `${name} ranks #${i + 1} with ${t.count.toLocaleString()} mentions (${frequencyPct}% of corpus) — ${prev ? prev.count - t.count : 0} fewer mentions than #${i} ${prev ? displayThemeName(prev.theme) : ""}. Sentiment ${sentimentPct}%, pain level ${painLevel}/5.`,
    };
  });

  const topPainRaw = (prioritization?.top_pain_points ??
    merged.topPainPoints.map((p) => ({
      pain_point: p.painPoint,
      frequency: p.frequency,
      avg_severity: p.avgSeverity,
      impact_score: p.frequency * p.avgSeverity,
    }))) as Array<Record<string, unknown>>;

  const sortedPains = [...topPainRaw].sort(
    (a, b) => (b.impact_score as number) - (a.impact_score as number)
  );

  const matrix = (prioritization?.prioritization_matrix ?? []) as Array<Record<string, unknown>>;
  const tierByPain = new Map<string, string>();
  for (const m of matrix) {
    if (m.type === "pain_point" && m.title) {
      tierByPain.set(String(m.title), String(m.tier ?? "Monitor"));
    }
  }

  const maxImpact = (sortedPains[0]?.impact_score as number) || 1;
  const rankedPainPoints: RankedPainPoint[] = sortedPains.slice(0, 8).map((p, i) => {
    const painPoint = p.pain_point as string;
    const reviewCount = (p.frequency as number) ?? 0;
    const painScore = (p.avg_severity as number) ?? 0;
    const impact = (p.impact_score as number) ?? reviewCount * painScore;

    return {
      rank: i + 1,
      label: shortPainLabel(painPoint),
      painPoint: insightOnly(painPoint),
      reviewCount,
      complaintFrequencyPct: pct(reviewCount, totalReviews),
      painScore: round(painScore, 1),
      sentimentIntensity: round(painScore / 5, 2),
      rankingScore: round(impact / maxImpact, 4),
      rankingProof: "",
      relatedThemes: [],
      tier: tierByPain.get(painPoint) ?? (i < 2 ? "Critical" : i < 5 ? "High" : "Monitor"),
    };
  });

  rankedPainPoints.forEach((p, i) => {
    p.rankingProof = buildPainRankingProof(
      p.rank,
      p,
      i > 0 ? rankedPainPoints[i - 1] : null,
      totalReviews
    );
  });

  const discoveryBehavior: DiscoveryBehaviorRow[] = rankedSegments.map((seg, i) => {
    const profile = profileByName.get(seg.name);
    const intent = (profile?.listening_intent_signals ?? {}) as Record<string, unknown>;
    return {
      rank: i + 1,
      segment: seg.name,
      definition: defineSegment(seg.name),
      volumePct: seg.reviewVolumePct,
      reviewCount: seg.reviewCount,
      painLevel: seg.painScore,
      negativePct: seg.negativePct,
      priorityScore: seg.rankingScore,
      rankingProof:
        i === 0
          ? `${seg.name} ranks #1 for discovery-behavior friction with priority score ${seg.rankingScore.toFixed(2)}, ${seg.reviewVolumePct}% review volume, and pain level ${seg.painScore}/5.`
          : `${seg.name} ranks #${i + 1} with priority score ${seg.rankingScore.toFixed(2)} vs #${i} ${rankedSegments[i - 1].name} (${rankedSegments[i - 1].rankingScore.toFixed(2)}). Dominant intent: ${intentLabel(String(intent.dominant_intent ?? "mixed"))}.`,
    };
  });

  const opportunities = (
    (prioritization?.opportunity_rankings ?? []) as Array<Record<string, unknown>>
  ).slice(0, 8);

  const crossAnalysis = buildCrossSegmentInsights(
    opportunities,
    rankedSegments,
    profileByName,
    segmentComparison,
    totalReviews
  );

  const keyOpportunities: RankedOpportunity[] = opportunities.map((o, i) => {
    const scores = (o.scores ?? {}) as Record<string, number>;
    const composite = scores.composite ?? 0;
    const reviewCount = (o.review_count as number) ?? 0;

    return {
      rank: (o.rank as number) ?? i + 1,
      name: insightOnly((o.pain_point as string) ?? "").slice(0, 160) || "Opportunity cluster",
      impactScore: round(composite * 100, 2),
      priorityLevel: (o.tier as string) ?? "Monitor",
      supportingMetrics: [
        { label: "Reviews", value: reviewCount.toLocaleString() },
        {
          label: "Frequency score",
          value: `${round((scores.frequency ?? 0) * 100, 1)}%`,
          hint: "Share of corpus citing this issue",
        },
        {
          label: "Severity score",
          value: `${round((scores.severity ?? 0) * 100, 1)}%`,
          hint: "Average expressed frustration intensity",
        },
        {
          label: "Segment impact",
          value: `${round((scores.segment_impact ?? 0) * 100, 1)}%`,
          hint: "Share of affected high-friction audiences",
        },
        {
          label: "Composite impact",
          value: round(composite * 100, 2).toFixed(2),
          hint: "Frequency × severity × segment impact",
        },
      ],
      rankingProof:
        `Rank #${(o.rank as number) ?? i + 1} (${String(o.tier ?? "Monitor")} priority): impact score ${round(composite * 100, 2)} ` +
        `from ${reviewCount.toLocaleString()} supporting reviews — frequency ${round((scores.frequency ?? 0) * 100, 1)}%, severity ${round((scores.severity ?? 0) * 100, 1)}%.`,
    };
  });

  const answers = (
    (weeklyReport?.sections as Record<string, unknown> | undefined)?.problem_statement_summary as
      | Record<string, unknown>
      | undefined
  )?.answers as Array<Record<string, unknown>> | undefined;

  const execFromReport =
    (weeklyReport?.sections as Record<string, unknown> | undefined)?.executive_summary as
      | Record<string, unknown>
      | undefined;

  const discoveryAnswer = answers?.find((a) => a.question_id === "discovery_struggle");
  const recAnswer = answers?.find((a) => a.question_id === "recommendation_frustrations");

  const proofPoints: string[] = [];
  if (rankedSegments[0]) {
    proofPoints.push(
      `Highest-friction segment: ${rankedSegments[0].name} (${rankedSegments[0].reviewVolumePct}% of reviews, ${rankedSegments[0].negativePct}% negative, ranking score ${rankedSegments[0].rankingScore.toFixed(2)}).`
    );
  }
  if (rankedPainPoints[0]) {
    proofPoints.push(
      `Top pain point (${rankedPainPoints[0].label}): ${rankedPainPoints[0].reviewCount.toLocaleString()} reviews (${rankedPainPoints[0].complaintFrequencyPct}% of corpus), pain score ${rankedPainPoints[0].painScore}/5.`
    );
  }
  if (rankedThemes[0]) {
    proofPoints.push(
      `Leading theme: ${rankedThemes[0].theme} (${rankedThemes[0].frequency.toLocaleString()} mentions, ${rankedThemes[0].frequencyPct}% of corpus).`
    );
  }
  if (typeof recAnswer?.finding_summary === "string") {
    const summary = insightOnly(recAnswer.finding_summary);
    if (summary) proofPoints.push(summary.slice(0, 240));
  }
  if (typeof discoveryAnswer?.finding_summary === "string") {
    const summary = insightOnly(discoveryAnswer.finding_summary);
    if (summary) proofPoints.push(summary.slice(0, 240));
  }

  const headline =
    insightOnly((execFromReport?.headline as string) ?? "") ||
    `Review analysis across ${totalReviews.toLocaleString()} reviews in the selected period.`;

  const narrativeParts = [
    insightOnly((execFromReport?.narrative as string) ?? ""),
    ...proofPoints.slice(0, 3),
  ].filter(Boolean);
  const narrative = narrativeParts.join(" ") || headline;

  const periodLabel =
    merged.weekLabels.length > 1
      ? `${merged.weekLabels[0]} — ${merged.weekLabels[merged.weekLabels.length - 1]}`
      : merged.weekLabels[0] ?? "Latest period";

  const confidenceFactors = merged.confidenceFactors?.join("; ") ?? "";

  const finalFindings: FinalInsightItem[] = [
    {
      category: "Segments",
      insight: `${rankedSegments[0]?.name ?? "—"} shows the highest friction ranking score in this period.`,
      proof: rankedSegments[0]?.rankingProof ?? "No segment data available.",
    },
    {
      category: "Themes",
      insight: `${rankedThemes[0]?.theme ?? "—"} is the most frequently cited theme in user reviews.`,
      proof: rankedThemes[0]?.rankingProof ?? "No theme data available.",
    },
    {
      category: "Pain points",
      insight: `${rankedPainPoints[0]?.label ?? "—"} is the top-ranked pain point by frequency × severity.`,
      proof: rankedPainPoints[0]?.rankingProof ?? "No pain point data available.",
    },
    {
      category: "Discovery behavior",
      insight: `${discoveryBehavior[0]?.segment ?? "—"} leads discovery-behavior friction signals.`,
      proof: discoveryBehavior[0]?.rankingProof ?? "No behavior data available.",
    },
    {
      category: "Opportunities",
      insight: `Highest-ranked opportunity cluster has impact score ${keyOpportunities[0]?.impactScore ?? "—"} (${keyOpportunities[0]?.priorityLevel ?? "—"} priority).`,
      proof: keyOpportunities[0]?.rankingProof ?? "No opportunity data available.",
    },
    {
      category: "Sentiment",
      insight: `${merged.sentiment.negativePct.toFixed(1)}% of reviews in scope express negative sentiment.`,
      proof: `${merged.sentiment.negative.toLocaleString()} negative, ${merged.sentiment.neutral.toLocaleString()} neutral, and ${merged.sentiment.positive.toLocaleString()} positive reviews in the merged period.`,
    },
  ];

  if (crossAnalysis[0]) {
    finalFindings.push({
      category: "Cross-segment patterns",
      insight: `Strongest cross-segment pattern: ${crossAnalysis[0].combination}.`,
      proof: crossAnalysis[0].rankingProof,
    });
  }

  return {
    meta: {
      title: "User Review Intelligence Report",
      subtitle: "Analyzer findings · Segments, themes, pain points, and opportunities",
      generatedAt: new Date().toISOString(),
      periodLabel,
      weekCount: merged.weekCount,
      totalReviews,
      confidenceLevel: merged.confidenceLevel,
      confidenceNote:
        confidenceFactors ||
        `Confidence ${merged.confidenceLevel} based on ${totalReviews.toLocaleString()} reviews in the selected period.`,
    },
    executiveSummary: {
      headline,
      narrative,
      proofPoints: proofPoints.slice(0, 6),
      scorecards: [
        { label: "Reviews analyzed", value: totalReviews.toLocaleString() },
        { label: "Weeks in scope", value: String(merged.weekCount) },
        { label: "Negative sentiment", value: `${merged.sentiment.negativePct.toFixed(1)}%` },
        { label: "Top segment", value: rankedSegments[0]?.name ?? "—" },
        {
          label: "Top theme",
          value: rankedThemes[0]?.theme ?? "—",
        },
        {
          label: "Critical opportunities",
          value: String(keyOpportunities.filter((o) => o.priorityLevel === "Critical").length),
        },
      ],
    },
    rankedSegments,
    segmentBreakdowns,
    rankedThemes,
    rankedPainPoints,
    discoveryBehavior,
    crossAnalysis,
    keyOpportunities,
    finalInsightsSummary: {
      headline: `Summary of analyzer findings across ${totalReviews.toLocaleString()} reviews`,
      findings: finalFindings,
      corpusMetrics: [
        { label: "Total reviews", value: totalReviews.toLocaleString() },
        { label: "Negative sentiment", value: `${merged.sentiment.negativePct.toFixed(1)}%` },
        { label: "Segments ranked", value: String(rankedSegments.length) },
        { label: "Themes tracked", value: String(rankedThemes.length) },
        { label: "Pain points ranked", value: String(rankedPainPoints.length) },
        { label: "Opportunities ranked", value: String(keyOpportunities.length) },
      ],
    },
  };
}
