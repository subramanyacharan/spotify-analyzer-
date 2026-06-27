export interface WeekSentiment {
  positive: number;
  neutral: number;
  negative: number;
  negativePct: number;
}

export interface WeekThemeCount {
  theme: string;
  count: number;
}

export interface WeekEmergingIssue {
  theme?: string;
  type: string;
  previousCount?: number;
  currentCount?: number;
  changePct: number;
  source: string;
  painPoint?: string;
}

export interface WeekSegmentFriction {
  segment: string;
  reviewCount: number;
  frictionScore: number;
  negativePct: number;
}

export interface WeekSnapshot {
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
  label: string;
  reviewCount: number;
  sentiment: WeekSentiment;
  topThemes: WeekThemeCount[];
  emergingIssues: WeekEmergingIssue[];
  segmentFriction: WeekSegmentFriction[];
  topPainPoints: { painPoint: string; frequency: number; avgSeverity: number }[];
  tierSummary: Record<string, number>;
  pulseReportMd: string;
  source: "supabase" | "computed";
}

export interface MergedWeeklyReport {
  fromWeek: number;
  toWeek: number;
  weekCount: number;
  weekLabels: string[];
  totalReviews: number;
  sentiment: WeekSentiment;
  topThemes: WeekThemeCount[];
  themeShifts: {
    theme: string;
    startCount: number;
    endCount: number;
    changePct: number;
  }[];
  sentimentDelta: {
    startNegativePct: number;
    endNegativePct: number;
    changePp: number;
  };
  emergingIssues: WeekEmergingIssue[];
  segmentFriction: WeekSegmentFriction[];
  topPainPoints: { painPoint: string; frequency: number; avgSeverity: number }[];
  tierSummary: Record<string, number>;
  snapshotsInRange: WeekSnapshot[];
  confidenceLevel: "High" | "Medium" | "Low";
  confidenceFactors: string[];
}

export interface WeeklyReportsCatalog {
  generatedAt: string;
  totalWeeks: number;
  weeks: WeekSnapshot[];
  dataSource: "supabase" | "local" | "mixed";
}
