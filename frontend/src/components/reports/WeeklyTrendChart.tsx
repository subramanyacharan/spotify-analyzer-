"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART } from "@/lib/analytics/chart-theme";
import type { MergedWeeklyReport } from "@/lib/reports/types";

export function WeeklyTrendChart({ report }: { report: MergedWeeklyReport }) {
  const data = report.snapshotsInRange.map((w) => ({
    name: `W${w.weekNumber}`,
    negative: Math.round(w.sentiment.negativePct * 10) / 10,
    reviews: w.reviewCount,
  }));

  if (!data.length) return null;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="name" stroke={CHART.axis} tick={{ fill: CHART.axis, fontSize: 11 }} />
        <YAxis stroke={CHART.axis} tick={{ fill: CHART.axis, fontSize: 10 }} />
        <Tooltip
          contentStyle={{
            background: CHART.tooltipBg,
            border: `1px solid ${CHART.tooltipBorder}`,
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar dataKey="negative" name="Negative %" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART.red} fillOpacity={0.75} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
