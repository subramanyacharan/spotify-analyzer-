"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART } from "@/lib/analytics/chart-theme";
import type { SegmentMatrixMetric } from "@/lib/analytics/types";

interface SegmentMatrixProps {
  metrics: SegmentMatrixMetric[];
  segmentA: string;
  segmentB: string;
}

export function SegmentMatrix({ metrics, segmentA, segmentB }: SegmentMatrixProps) {
  const chartData = metrics.map((m) => ({
    metric: m.metric,
    [segmentA]: m.values[segmentA] ?? 0,
    [segmentB]: m.values[segmentB] ?? 0,
  }));

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">Segment matrix</h3>
          <p className="text-xs text-zinc-500">
            Comparing behavioral variance across selected cohorts
          </p>
        </div>
        <div className="flex gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span className="h-2 w-2 rounded-full bg-[#1db954]" />
            {segmentA}
          </span>
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span className="h-2 w-2 rounded-full bg-zinc-400" />
            {segmentB}
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
          <XAxis
            dataKey="metric"
            stroke={CHART.axis}
            tick={{ fill: CHART.axis, fontSize: 10 }}
          />
          <YAxis
            domain={[0, 1]}
            stroke={CHART.axis}
            tick={{ fill: CHART.axis, fontSize: 10 }}
          />
          <Tooltip
            contentStyle={{
              background: CHART.tooltipBg,
              border: `1px solid ${CHART.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey={segmentA}
            stroke={CHART.green}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey={segmentB}
            stroke="#a1a1aa"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
