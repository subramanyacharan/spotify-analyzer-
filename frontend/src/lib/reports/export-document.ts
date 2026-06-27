import { defineSegment, defineTheme } from "./segment-definitions";
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
  mentionCount: number;
  reviewVolumePct: number;
  rankingProof: string;
}

export interface DiscoveryBehaviorRow {
  segment: string;
  dominantIntent: string;
  discoveryPct: number;
  comfortPct: number;
  moodPct: number;
  insight: string;
}

export interface CrossAnalysisPair {
  segmentA: string;
  segmentB: string;
  sharedThemes: string[];
  frictionGap: string;
  volumeComparison: string;
  strategicImplication: string;
}

export interface KeyOpportunity {
  rank: number;
  title: string;
  tier: string;
  compositeScore: number;
  scores: ReportMetric[];
  rankingProof: string;
  productOpportunity: string;
  featureRequest: string;
  affectedSegment: string;
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
  rankedPainPoints: RankedPainPoint[];
  rankedThemes: RankedTheme[];
  discoveryBehavior: DiscoveryBehaviorRow[];
  crossAnalysis: CrossAnalysisPair[];
  keyOpportunities: KeyOpportunity[];
  finalRecommendation: {
    title: string;
    tier: string;
    action: string;
    proof: string;
    expectedImpact: string;
    nextSteps: string[];
  };
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function round(n: number, d = 2): number {
  const m = 10 ** d;
  return Math.round(n * m) / m;
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
      `${name} ranks #1 because it combines the highest ranking score (${cur.rankingScore.toFixed(2)}), ` +
      `${volLabel}, ${cur.negativePct.toFixed(1)}% negative sentiment, and the densest complaint concentration ` +
      `(${cur.complaintFrequencyPct.toFixed(1)}% complaint frequency among its reviews).`
    );
  }
  if (prev) {
    return (
      `${name} ranks #${rank} with ranking score ${cur.rankingScore.toFixed(2)} vs #${rank - 1} ${prev.name} ` +
      `(${prev.rankingScore.toFixed(2)}). Key gap drivers: ${volLabel}, ${cur.negativePct.toFixed(1)}% negative ` +
      `sentiment, pain score ${cur.painScore.toFixed(1)}/5.`
    );
  }
  return `${name} ranks #${rank} on combined friction, volume, and negative sentiment signals in this period.`;
}

function buildPainRankingProof(
  rank: number,
  pain: RankedPainPoint,
  prev: RankedPainPoint | null,
  totalReviews: number
): string {
  if (rank === 1) {
    return (
      `Ranked #1 because ${pain.reviewCount.toLocaleString()} reviews (${pain.complaintFrequencyPct.toFixed(1)}% of corpus) ` +
      `cite this issue with pain score ${pain.painScore.toFixed(1)}/5 and priority score ${pain.rankingScore.toFixed(2)} — ` +
      `the highest impact combination in ${totalReviews.toLocaleString()} analyzed reviews.`
    );
  }
  if (prev) {
    return (
      `Ranked #${rank} with ${pain.reviewCount.toLocaleString()} mentions vs #${rank - 1} at ${prev.reviewCount.toLocaleString()}. ` +
      `Pain score ${pain.painScore.toFixed(1)}/5 and composite priority ${pain.rankingScore.toFixed(2)} place it below ${prev.painPoint.slice(0, 60)}…`
    );
  }
  return `Ranked #${rank} by frequency × severity priority scoring across ${totalReviews.toLocaleString()} reviews.`;
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

  const rawProfiles = (segmentDeepDives?.segment_profiles ?? []) as Array<
    Record<string, unknown>
  >;
  const profileByName = new Map(
    rawProfiles.map((p) => [p.segment as string, p])
  );

  const rankedSegments: RankedSegment[] = frictionScores.map((fs, i) => {
    const name = fs.segment as string;
    const profile = profileByName.get(name);
    const reviewCount = (fs.review_count as number) ?? 0;
    const negativePct = (fs.negative_pct as number) ?? 0;
    const frictionScore = (fs.friction_score as number) ?? 0;
    const sentiment = (profile?.sentiment_breakdown ?? {}) as Record<string, number>;
    const sentimentScore = sentiment.avg_sentiment_score ?? round(5 - (negativePct / 100) * 2, 2);
    const painScore = (fs.avg_cluster_severity as number) ?? (profile?.avg_cluster_severity as number) ?? 0;
    const topThemesRaw = (profile?.top_themes ?? []) as Array<Record<string, unknown>>;
    const topPainRaw = (profile?.top_pain_points ?? []) as Array<Record<string, unknown>>;
    const topPainCount = (topPainRaw[0]?.count as number) ?? 0;
    const complaintFrequencyPct = pct(topPainCount, reviewCount);

    const seg: RankedSegment = {
      rank: i + 1,
      name,
      definition: defineSegment(name),
      reviewCount,
      reviewVolumePct: pct(reviewCount, totalReviews),
      sentimentScore: round(sentimentScore, 2),
      negativePct: round(negativePct, 1),
      painScore: round(painScore, 1),
      complaintFrequencyPct,
      rankingScore: round(frictionScore, 4),
      rankingProof: "",
      topThemes: topThemesRaw.slice(0, 3).map((t) => t.theme as string),
      topPainSummary: (topPainRaw[0]?.pain_point as string)?.slice(0, 140) ?? "—",
    };
    return seg;
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

  const segmentBreakdowns: SegmentBreakdown[] = rankedSegments.slice(0, 6).map((seg) => {
    const profile = profileByName.get(seg.name);
    const topThemes = ((profile?.top_themes ?? []) as Array<Record<string, unknown>>).slice(0, 4);
    const topPains = ((profile?.top_pain_points ?? []) as Array<Record<string, unknown>>).slice(0, 3);
    const intent = (profile?.listening_intent_signals ?? {}) as Record<string, unknown>;
    const quotes = (profile?.representative_quotes ?? []) as string[];

    const discoverySignals =
      intent.dominant_intent
        ? `Dominant intent: ${intent.dominant_intent}. Discovery language in ${intent.discovery_pct ?? 0}% of reviews; comfort/habit in ${intent.comfort_habit_pct ?? 0}%.`
        : "Listening intent inferred from review language patterns in this cohort.";

    return {
      name: seg.name,
      definition: seg.definition,
      metrics: [
        {
          label: "Review volume",
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
          hint: "Severity of cited product issues",
        },
        {
          label: "Complaint frequency",
          value: `${seg.complaintFrequencyPct}%`,
          hint: "Share of cohort reviews citing top pain cluster",
        },
        {
          label: "Ranking score",
          value: seg.rankingScore.toFixed(2),
          hint: "Friction index used for segment rank (higher = more priority)",
        },
      ],
      rankingProof: seg.rankingProof,
      topThemes: topThemes.map((t) => ({
        theme: t.theme as string,
        definition: defineTheme(t.theme as string),
        count: t.count as number,
        pct: round(t.pct as number, 1),
      })),
      topPains: topPains.map((p) => ({
        summary: (p.pain_point as string).slice(0, 120),
        count: p.count as number,
        pct: round(p.pct as number, 1),
      })),
      discoverySignals,
      sampleQuote: quotes[0]?.slice(0, 200),
    };
  });

  const topPainRaw = (prioritization?.top_pain_points ?? merged.topPainPoints.map((p) => ({
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

  const rankedPainPoints: RankedPainPoint[] = sortedPains.slice(0, 8).map((p, i) => {
    const painPoint = p.pain_point as string;
    const reviewCount = (p.frequency as number) ?? 0;
    const painScore = (p.avg_severity as number) ?? 0;
    const impact = (p.impact_score as number) ?? reviewCount * painScore;
    const item: RankedPainPoint = {
      rank: i + 1,
      painPoint,
      reviewCount,
      complaintFrequencyPct: pct(reviewCount, totalReviews),
      painScore: round(painScore, 1),
      sentimentIntensity: round(painScore / 5, 2),
      rankingScore: round(impact / (sortedPains[0]?.impact_score as number || 1), 4),
      rankingProof: "",
      relatedThemes: [],
      tier: tierByPain.get(painPoint) ?? (i < 2 ? "Critical" : i < 5 ? "High" : "Monitor"),
    };
    return item;
  });

  rankedPainPoints.forEach((p, i) => {
    p.rankingProof = buildPainRankingProof(
      p.rank,
      p,
      i > 0 ? rankedPainPoints[i - 1] : null,
      totalReviews
    );
  });

  const rankedThemes: RankedTheme[] = merged.topThemes.slice(0, 8).map((t, i) => ({
    rank: i + 1,
    theme: t.theme,
    definition: defineTheme(t.theme),
    mentionCount: t.count,
    reviewVolumePct: pct(t.count, totalReviews),
    rankingProof:
      i === 0
        ? `${t.theme} ranks #1 with ${t.count.toLocaleString()} mentions (${pct(t.count, totalReviews)}% of review corpus) — the most discussed theme in this period.`
        : `${t.theme} ranks #${i + 1} with ${t.count.toLocaleString()} mentions, ${pct(merged.topThemes[0].count - t.count, merged.topThemes[0].count)}% below the leading theme ${merged.topThemes[0].theme}.`,
  }));

  const discoveryBehavior: DiscoveryBehaviorRow[] = rawProfiles
    .slice(0, 6)
    .map((p) => {
      const intent = (p.listening_intent_signals ?? {}) as Record<string, unknown>;
      const discoveryPct = round((intent.discovery_pct as number) ?? 0, 1);
      const comfortPct = round((intent.comfort_habit_pct as number) ?? 0, 1);
      const moodPct = round((intent.mood_context_pct as number) ?? 0, 1);
      const dominant = String(intent.dominant_intent ?? "mixed");
      const segName = p.segment as string;
      const neg = ((p.sentiment_breakdown ?? {}) as Record<string, number>).negative_pct ?? 0;

      let insight = "";
      if (dominant === "discovery" && discoveryPct > 2) {
        insight = `${segName} over-indexes on discovery language — recommendation quality is a direct lever for satisfaction.`;
      } else if (comfortPct > discoveryPct) {
        insight = `${segName} leans comfort/habit listening; fatigue and repetition drive ${neg.toFixed(1)}% negative feedback.`;
      } else {
        insight = `${segName} shows mixed intent signals — prioritize UX clarity and playlist control.`;
      }

      return {
        segment: segName,
        dominantIntent: dominant,
        discoveryPct,
        comfortPct,
        moodPct,
        insight,
      };
    });

  const crossAnalysis: CrossAnalysisPair[] = [];
  if (rankedSegments.length >= 2) {
    const a = rankedSegments[0];
    const b = rankedSegments[1];
    const profA = profileByName.get(a.name);
    const profB = profileByName.get(b.name);
    const themesA = new Set(
      ((profA?.top_themes ?? []) as Array<Record<string, unknown>>).map((t) => t.theme as string)
    );
    const themesB = ((profB?.top_themes ?? []) as Array<Record<string, unknown>>).map(
      (t) => t.theme as string
    );
    const shared = themesB.filter((t) => themesA.has(t));

    crossAnalysis.push({
      segmentA: a.name,
      segmentB: b.name,
      sharedThemes: shared.slice(0, 4),
      frictionGap: `#1 ${a.name} friction ${a.rankingScore.toFixed(2)} vs #2 ${b.name} ${b.rankingScore.toFixed(2)} (${a.negativePct}% vs ${b.negativePct}% negative).`,
      volumeComparison: `${a.name} represents ${a.reviewVolumePct}% of reviews; ${b.name} represents ${b.reviewVolumePct}%.`,
      strategicImplication:
        shared.length > 0
          ? `Both cohorts cite ${shared.join(", ")} — fixes here scale across ${(a.reviewVolumePct + b.reviewVolumePct).toFixed(0)}%+ of feedback volume.`
          : `Cohorts diverge in themes — tailor discovery fixes for ${a.name} first, then ${b.name}.`,
    });
  }

  const opportunities = (
    (prioritization?.opportunity_rankings ?? []) as Array<Record<string, unknown>>
  ).slice(0, 6);

  const keyOpportunities: KeyOpportunity[] = opportunities.map((o, i) => {
    const scores = (o.scores ?? {}) as Record<string, number>;
    const evidence = (o.evidence ?? {}) as Record<string, unknown>;
    const segBreak = (evidence.segment_breakdown ?? []) as Array<Record<string, unknown>>;
    const topSeg = segBreak[0]?.segment as string | undefined;
    const composite = scores.composite ?? 0;

    return {
      rank: (o.rank as number) ?? i + 1,
      title: (o.pain_point as string) ?? (o.product_opportunity as string) ?? "Opportunity",
      tier: (o.tier as string) ?? "Monitor",
      compositeScore: round(composite * 100, 2),
      scores: [
        {
          label: "Frequency",
          value: `${round((scores.frequency ?? 0) * 100, 1)}%`,
          hint: "How often this issue appears in reviews",
        },
        {
          label: "Severity",
          value: `${round((scores.severity ?? 0) * 100, 1)}%`,
          hint: "How strongly users express frustration",
        },
        {
          label: "Segment impact",
          value: `${round((scores.segment_impact ?? 0) * 100, 1)}%`,
          hint: "Share of affected high-friction audiences",
        },
        {
          label: "Composite",
          value: `${round(composite * 100, 2)}`,
          hint: "Weighted priority score (frequency × severity × segment impact)",
        },
      ],
      rankingProof:
        `Rank #${(o.rank as number) ?? i + 1} (${String(o.tier ?? "Monitor")} tier): composite ${round(composite * 100, 2)} ` +
        `from ${(o.review_count as number)?.toLocaleString() ?? "—"} supporting reviews — ` +
        `frequency ${round((scores.frequency ?? 0) * 100, 1)}%, severity ${round((scores.severity ?? 0) * 100, 1)}%.`,
      productOpportunity: (o.product_opportunity as string) ?? "",
      featureRequest: (o.feature_request as string) ?? "",
      affectedSegment: topSeg ?? rankedSegments[0]?.name ?? "—",
    };
  });

  const topPriority = prioritization?.top_priority as Record<string, unknown> | undefined;
  const execFromReport =
    (weeklyReport?.sections as Record<string, unknown> | undefined)?.executive_summary as
      | Record<string, unknown>
      | undefined;

  const answers = (
    (weeklyReport?.sections as Record<string, unknown> | undefined)?.problem_statement_summary as
      | Record<string, unknown>
      | undefined
  )?.answers as Array<Record<string, unknown>> | undefined;

  const proofPoints: string[] = [];
  if (rankedSegments[0]) {
    proofPoints.push(
      `Highest-friction segment: ${rankedSegments[0].name} (${rankedSegments[0].reviewVolumePct}% of reviews, ${rankedSegments[0].negativePct}% negative).`
    );
  }
  if (rankedPainPoints[0]) {
    proofPoints.push(
      `Top pain point cited in ${rankedPainPoints[0].reviewCount.toLocaleString()} reviews (${rankedPainPoints[0].complaintFrequencyPct}% of corpus).`
    );
  }
  if (rankedThemes[0]) {
    proofPoints.push(
      `Leading theme: ${rankedThemes[0].theme} (${rankedThemes[0].mentionCount.toLocaleString()} mentions).`
    );
  }
  if (answers?.length) {
    for (const ans of answers.slice(0, 2)) {
      if (typeof ans.finding_summary === "string") {
        proofPoints.push(ans.finding_summary.slice(0, 220));
      }
    }
  }

  const headline =
    (execFromReport?.headline as string) ??
    `Discovery and recommendation quality dominate user feedback across ${totalReviews.toLocaleString()} reviews.`;

  const narrative =
    (execFromReport?.narrative as string) ??
    (topPriority?.recommendation as string) ??
    `Priority action: address ${rankedPainPoints[0]?.painPoint.slice(0, 100) ?? "top-ranked pain point"} for ${rankedSegments[0]?.name ?? "leading segment"}.`;

  const periodLabel =
    merged.weekLabels.length > 1
      ? `${merged.weekLabels[0]} — ${merged.weekLabels[merged.weekLabels.length - 1]}`
      : merged.weekLabels[0] ?? "Latest period";

  const confidenceFactors = merged.confidenceFactors?.join("; ") ?? "";

  return {
    meta: {
      title: "Product Research Intelligence Report",
      subtitle: "User Review Analysis · Discovery & Recommendation Strategy",
      generatedAt: new Date().toISOString(),
      periodLabel,
      weekCount: merged.weekCount,
      totalReviews,
      confidenceLevel: merged.confidenceLevel,
      confidenceNote:
        confidenceFactors ||
        `Confidence ${merged.confidenceLevel} based on ${totalReviews.toLocaleString()} reviews in selected period.`,
    },
    executiveSummary: {
      headline,
      narrative,
      proofPoints: proofPoints.slice(0, 5),
      scorecards: [
        { label: "Reviews analyzed", value: totalReviews.toLocaleString() },
        { label: "Weeks in scope", value: String(merged.weekCount) },
        { label: "Negative sentiment", value: `${merged.sentiment.negativePct.toFixed(1)}%` },
        { label: "Top segment", value: rankedSegments[0]?.name ?? "—" },
        { label: "Critical opportunities", value: String(keyOpportunities.filter((o) => o.tier === "Critical").length) },
      ],
    },
    rankedSegments,
    segmentBreakdowns,
    rankedPainPoints,
    rankedThemes,
    discoveryBehavior,
    crossAnalysis,
    keyOpportunities,
    finalRecommendation: {
      title: (topPriority?.title as string) ?? rankedPainPoints[0]?.painPoint.slice(0, 120) ?? "Top priority",
      tier: (topPriority?.tier as string) ?? "Critical",
      action: (topPriority?.recommendation as string) ?? keyOpportunities[0]?.productOpportunity ?? narrative,
      proof:
        rankedPainPoints[0]?.rankingProof ??
        rankedSegments[0]?.rankingProof ??
        "Highest composite priority score in current review corpus.",
      expectedImpact: keyOpportunities[0]
        ? `Targets ${keyOpportunities[0].affectedSegment} (${keyOpportunities[0].scores[3]?.value} composite priority) — potential reduction in ${rankedPainPoints[0]?.complaintFrequencyPct ?? "—"}% complaint volume.`
        : "Improves satisfaction for highest-friction discovery cohorts.",
      nextSteps: [
        `Validate with ${rankedSegments[0]?.name ?? "top segment"} users: ${rankedSegments[0]?.topPainSummary.slice(0, 80) ?? "top pain theme"}.`,
        `Ship fix for ${rankedThemes[0]?.theme ?? "leading theme"} — ${rankedThemes[0]?.mentionCount.toLocaleString() ?? "—"} mentions.`,
        `Monitor weekly negative % (currently ${merged.sentiment.negativePct.toFixed(1)}%) after release.`,
      ],
    },
  };
}
