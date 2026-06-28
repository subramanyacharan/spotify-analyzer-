import type {
  MergedWeeklyReport,
  WeekEmergingIssue,
  WeekSegmentFriction,
  WeekSentiment,
  WeekSnapshot,
  WeekThemeCount,
} from "../reports/types";
import { computeConfidence } from "../confidence";

export function mergeWeekRange(
  weeks: WeekSnapshot[],
  fromWeek: number,
  toWeek: number
): MergedWeeklyReport {
  const from = Math.min(fromWeek, toWeek);
  const to = Math.max(fromWeek, toWeek);
  const inRange = weeks.filter((w) => w.weekNumber >= from && w.weekNumber <= to);

  if (!inRange.length) {
    return emptyMerged(from, to);
  }

  const totalReviews = inRange.reduce((sum, w) => sum + w.reviewCount, 0);
  const sentiment = mergeSentiment(inRange);
  const topThemes = mergeThemes(inRange);
  const first = inRange[0];
  const last = inRange[inRange.length - 1];
  const themeShifts = computeThemeShifts(first.topThemes, last.topThemes);
  const sentimentDelta = {
    startNegativePct: first.sentiment.negativePct,
    endNegativePct: last.sentiment.negativePct,
    changePp: last.sentiment.negativePct - first.sentiment.negativePct,
  };

  const emergingIssues = dedupeEmerging(
    inRange.flatMap((w) => w.emergingIssues)
  );
  const segmentFriction = mergeSegmentFriction(inRange);
  const topPainPoints = mergePainPoints(inRange);
  const tierSummary = mergeTierSummary(inRange);

  const { level, factors } = computeConfidence({
    reviewCount: totalReviews,
    avgClusterSeverity:
      segmentFriction.length > 0
        ? segmentFriction.reduce((s, x) => s + x.frictionScore * 5, 0) /
          segmentFriction.length
        : undefined,
    negativePct: sentiment.negativePct,
    quoteCount: emergingIssues.length,
    hasClusterInsight: topPainPoints.length > 0,
  });

  return {
    fromWeek: from,
    toWeek: to,
    weekCount: inRange.length,
    weekLabels: inRange.map((w) => w.label),
    totalReviews,
    sentiment,
    topThemes,
    themeShifts,
    sentimentDelta,
    emergingIssues,
    segmentFriction,
    topPainPoints,
    tierSummary,
    snapshotsInRange: inRange,
    confidenceLevel: level,
    confidenceFactors: factors,
  };
}

function emptyMerged(from: number, to: number): MergedWeeklyReport {
  return {
    fromWeek: from,
    toWeek: to,
    weekCount: 0,
    weekLabels: [],
    totalReviews: 0,
    sentiment: { positive: 0, neutral: 0, negative: 0, negativePct: 0 },
    topThemes: [],
    themeShifts: [],
    sentimentDelta: { startNegativePct: 0, endNegativePct: 0, changePp: 0 },
    emergingIssues: [],
    segmentFriction: [],
    topPainPoints: [],
    tierSummary: {},
    snapshotsInRange: [],
    confidenceLevel: "Low",
    confidenceFactors: ["No data for selected weeks"],
  };
}

function mergeSentiment(weeks: WeekSnapshot[]): WeekSentiment {
  const positive = weeks.reduce((s, w) => s + w.sentiment.positive, 0);
  const neutral = weeks.reduce((s, w) => s + w.sentiment.neutral, 0);
  const negative = weeks.reduce((s, w) => s + w.sentiment.negative, 0);
  const total = positive + neutral + negative || 1;
  return {
    positive,
    neutral,
    negative,
    negativePct: (negative / total) * 100,
  };
}

function mergeThemes(weeks: WeekSnapshot[]): WeekThemeCount[] {
  const map = new Map<string, number>();
  for (const w of weeks) {
    for (const t of w.topThemes) {
      map.set(t.theme, (map.get(t.theme) ?? 0) + t.count);
    }
  }
  return Array.from(map.entries())
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function computeThemeShifts(
  startThemes: WeekThemeCount[],
  endThemes: WeekThemeCount[]
) {
  const startMap = new Map(startThemes.map((t) => [t.theme, t.count]));
  const endMap = new Map(endThemes.map((t) => [t.theme, t.count]));
  const allThemes = new Set([...startMap.keys(), ...endMap.keys()]);

  return Array.from(allThemes)
    .map((theme) => {
      const startCount = startMap.get(theme) ?? 0;
      const endCount = endMap.get(theme) ?? 0;
      const changePct =
        startCount > 0 ? ((endCount - startCount) / startCount) * 100 : endCount > 0 ? 100 : 0;
      return { theme, startCount, endCount, changePct };
    })
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 6);
}

function dedupeEmerging(issues: WeekEmergingIssue[]): WeekEmergingIssue[] {
  const seen = new Map<string, WeekEmergingIssue>();
  for (const issue of issues) {
    const key = issue.theme ?? issue.painPoint ?? issue.type;
    const existing = seen.get(key);
    if (!existing || issue.changePct > existing.changePct) {
      seen.set(key, issue);
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.changePct - a.changePct);
}

function mergeSegmentFriction(weeks: WeekSnapshot[]): WeekSegmentFriction[] {
  const map = new Map<
    string,
    { reviewCount: number; frictionSum: number; negSum: number; weight: number }
  >();
  for (const w of weeks) {
    for (const s of w.segmentFriction) {
      const cur = map.get(s.segment) ?? {
        reviewCount: 0,
        frictionSum: 0,
        negSum: 0,
        weight: 0,
      };
      cur.reviewCount += s.reviewCount;
      cur.frictionSum += s.frictionScore * s.reviewCount;
      cur.negSum += s.negativePct * s.reviewCount;
      cur.weight += s.reviewCount;
      map.set(s.segment, cur);
    }
  }
  return Array.from(map.entries())
    .map(([segment, v]) => ({
      segment,
      reviewCount: v.reviewCount,
      frictionScore: v.weight > 0 ? v.frictionSum / v.weight : 0,
      negativePct: v.weight > 0 ? v.negSum / v.weight : 0,
    }))
    .sort((a, b) => b.frictionScore - a.frictionScore);
}

function mergePainPoints(weeks: WeekSnapshot[]) {
  const map = new Map<string, { frequency: number; severitySum: number; n: number }>();
  for (const w of weeks) {
    for (const p of w.topPainPoints) {
      const cur = map.get(p.painPoint) ?? { frequency: 0, severitySum: 0, n: 0 };
      cur.frequency += p.frequency;
      cur.severitySum += p.avgSeverity;
      cur.n += 1;
      map.set(p.painPoint, cur);
    }
  }
  return Array.from(map.entries())
    .map(([painPoint, v]) => ({
      painPoint,
      frequency: v.frequency,
      avgSeverity: v.n > 0 ? v.severitySum / v.n : 0,
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 5);
}

function mergeTierSummary(weeks: WeekSnapshot[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const w of weeks) {
    for (const [tier, count] of Object.entries(w.tierSummary)) {
      out[tier] = (out[tier] ?? 0) + count;
    }
  }
  return out;
}

export { mergeSentiment, mergeThemes };
