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
import { USER_MESSAGES } from "@/lib/auth/user-messages";
import type { WeeklySentiment } from "@/lib/analytics/types";
import { ChartAxisLabels } from "../ui/ChartAxisLabels";

interface SentimentTrendChartProps {
  data: WeeklySentiment[];
}

export function SentimentTrendChart({ data }: SentimentTrendChartProps) {
  if (!data.length) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-zinc-500">
        {USER_MESSAGES.noTrendData}
      </div>
    );
  }

  return (
    <>
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
      <ChartAxisLabels
        xLabel="Week (time period of collected reviews)"
        yLabel="Review count (stacked areas) and negative % (amber line on right scale)"
        note="Stacked areas show positive, neutral, and negative review volume per week. The line tracks negative sentiment percentage."
      />
    </>
  );
}
