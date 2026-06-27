"use client";

import {
  Bar,
  BarChart,
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
import {
  COHORT_LINE_COLORS,
  type CohortChartView,
} from "@/lib/analytics/segment-chart-metrics";
import type { SegmentMatrixMetric, SegmentProfile } from "@/lib/analytics/types";
import { ChartAxisLabels } from "../ui/ChartAxisLabels";

interface SegmentMatrixProps {
  metrics: SegmentMatrixMetric[];
  cohorts: SegmentProfile[];
  viewMode: CohortChartView;
}

export function SegmentMatrix({ metrics, cohorts, viewMode }: SegmentMatrixProps) {
  const cohortNames = cohorts.map((c) => c.name);

  const chartData = metrics.map((m) => {
    const row: Record<string, string | number> = { metric: m.metric };
    for (const name of cohortNames) {
      row[name] = m.values[name] ?? 0;
    }
    return row;
  });

  const allCohortsBarData = cohorts.map((c) => ({
    name: c.name.length > 18 ? `${c.name.slice(0, 16)}…` : c.name,
    fullName: c.name,
    friction: c.frictionScore,
    satisfaction: Math.round((1 - c.negativePct / 100) * 100) / 100,
    negativePct: c.negativePct,
  }));

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 lg:col-span-2">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white">
          {viewMode === "all" ? "All cohorts overview" : "Selected cohort comparison"}
        </h3>
        <p className="text-xs text-zinc-500">
          {viewMode === "all"
            ? "Friction and satisfaction side-by-side for every cohort"
            : "How selected cohorts differ across key metrics"}
        </p>
      </div>

      {viewMode === "all" ? (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={allCohortsBarData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
              <XAxis
                dataKey="name"
                stroke={CHART.axis}
                tick={{ fill: CHART.axis, fontSize: 10 }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={56}
              />
              <YAxis
                domain={[0, 1]}
                stroke={CHART.axis}
                tick={{ fill: CHART.axis, fontSize: 10 }}
                tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
              />
              <Tooltip
                contentStyle={{
                  background: CHART.tooltipBg,
                  border: `1px solid ${CHART.tooltipBorder}`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value, name, props) => {
                  const row = props.payload as { fullName?: string; negativePct?: number };
                  if (name === "friction") {
                    return [
                      `${(Number(value) * 100).toFixed(0)}% friction · ${row.negativePct?.toFixed(1)}% negative reviews`,
                      row.fullName ?? "Cohort",
                    ];
                  }
                  return [`${(Number(value) * 100).toFixed(0)}%`, "Satisfaction index"];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="friction" name="Friction index" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar
                dataKey="satisfaction"
                name="Satisfaction index"
                fill={CHART.green}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
          <ChartAxisLabels
            xLabel="Audience cohort (from the active lens tab)"
            yLabel="Index score from 0 to 1 — friction = share of negative feedback; satisfaction = inverse of negative feedback"
            note="Higher friction bars mean more users in that cohort are expressing frustration in reviews."
          />
          <div className="mt-6">
            <p className="mb-2 text-xs font-medium text-zinc-400">Multi-metric comparison (all cohorts)</p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
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
                  tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: CHART.tooltipBg,
                    border: `1px solid ${CHART.tooltipBorder}`,
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value) => [`${(Number(value) * 100).toFixed(0)}%`, "Score"]}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {cohortNames.map((name, i) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={COHORT_LINE_COLORS[i % COHORT_LINE_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <ChartAxisLabels
              xLabel="Metric dimension (retention, discovery, friction signals, etc.)"
              yLabel="Normalized score from 0 (lowest) to 1 (highest) within each metric"
            />
          </div>
        </>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
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
                tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
              />
              <Tooltip
                contentStyle={{
                  background: CHART.tooltipBg,
                  border: `1px solid ${CHART.tooltipBorder}`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value, name) => [
                  `${(Number(value) * 100).toFixed(0)}%`,
                  String(name),
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {cohortNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={COHORT_LINE_COLORS[i % COHORT_LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <ChartAxisLabels
            xLabel="Metric being compared (e.g. retention, discovery, friction)"
            yLabel="Normalized score from 0 (lowest) to 1 (highest) — lets you compare cohorts on the same scale"
            note="Each line is one cohort you selected above. Steeper gaps between lines mean bigger differences in user experience."
          />
        </>
      )}
    </section>
  );
}
