"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART } from "@/lib/analytics/chart-theme";
import type { WeeklySentiment } from "@/lib/analytics/types";

interface SentimentTrendChartProps {
  data: WeeklySentiment[];
}

export function SentimentTrendChart({ data }: SentimentTrendChartProps) {
  if (!data.length) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-zinc-500">
        Weekly sentiment trend unavailable — connect Supabase for live data.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
        <XAxis
          dataKey="weekLabel"
          stroke={CHART.axis}
          tick={{ fill: CHART.axis, fontSize: 10 }}
        />
        <YAxis stroke={CHART.axis} tick={{ fill: CHART.axis, fontSize: 10 }} />
        <Tooltip
          contentStyle={{
            background: CHART.tooltipBg,
            border: `1px solid ${CHART.tooltipBorder}`,
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Area
          type="monotone"
          dataKey="positive"
          stackId="1"
          stroke={CHART.green}
          fill={CHART.green}
          fillOpacity={0.35}
        />
        <Area
          type="monotone"
          dataKey="neutral"
          stackId="1"
          stroke={CHART.neutral}
          fill={CHART.neutral}
          fillOpacity={0.25}
        />
        <Area
          type="monotone"
          dataKey="negative"
          stackId="1"
          stroke={CHART.red}
          fill={CHART.red}
          fillOpacity={0.35}
        />
        <Line
          type="monotone"
          dataKey="negativePct"
          stroke={CHART.amber}
          strokeWidth={2}
          dot={false}
          name="Negative %"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
