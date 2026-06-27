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
import type { OpportunityItem } from "@/lib/opportunities/types";

interface OpportunityScoreChartProps {
  opportunities: OpportunityItem[];
}

export function OpportunityScoreChart({ opportunities }: OpportunityScoreChartProps) {
  const data = opportunities.slice(0, 8).map((o) => ({
    name: `#${o.rank}`,
    score: Math.round(o.scores.composite * 1000) / 10,
    tier: o.tier,
    fullTitle: o.painPoint.slice(0, 60),
  }));

  const tierColor = (tier: string) =>
    tier === "Critical" ? CHART.red : tier === "High" ? CHART.amber : CHART.neutral;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="name" stroke={CHART.axis} tick={{ fill: CHART.axis, fontSize: 11 }} />
        <YAxis
          stroke={CHART.axis}
          tick={{ fill: CHART.axis, fontSize: 10 }}
          tickFormatter={(v) => `${v}`}
        />
        <Tooltip
          contentStyle={{
            background: CHART.tooltipBg,
            border: `1px solid ${CHART.tooltipBorder}`,
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value) => [`${value}`, "Composite ×100"]}
          labelFormatter={(_, payload) =>
            (payload?.[0]?.payload as { fullTitle?: string })?.fullTitle ?? ""
          }
        />
        <Bar dataKey="score" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={tierColor(entry.tier)} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
