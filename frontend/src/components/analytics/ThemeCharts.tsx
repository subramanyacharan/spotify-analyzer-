"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART } from "@/lib/analytics/chart-theme";
import { chartBarColor } from "@/lib/copy/terminology";
import type { ThemeVolume } from "@/lib/analytics/types";
import { ChartAxisLabels } from "../ui/ChartAxisLabels";

interface ThemeBarChartProps {
  themes: ThemeVolume[];
}

export function ThemeBarChart({ themes }: ThemeBarChartProps) {
  const data = themes
    .filter((t) => t.count > 0)
    .map((t) => ({
    name: t.theme.length > 22 ? `${t.theme.slice(0, 20)}…` : t.theme,
    fullName: t.theme,
    count: t.count,
    negativePct: t.negativePct,
  }));

  return (
    <>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
          <XAxis type="number" stroke={CHART.axis} tick={{ fill: CHART.axis, fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            stroke={CHART.axis}
            tick={{ fill: "#aaa", fontSize: 10 }}
          />
          <Tooltip
            contentStyle={{
              background: CHART.tooltipBg,
              border: `1px solid ${CHART.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value, _name, props) => {
              const row = props.payload as { fullName?: string; negativePct?: number };
              return [
                `${Number(value).toLocaleString()} mentions · ${(row.negativePct ?? 0).toFixed(1)}% negative`,
                row.fullName ?? "Theme",
              ];
            }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((row, i) => (
              <Cell key={i} fill={chartBarColor(row.negativePct)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <ChartAxisLabels
        xLabel="Number of reviews mentioning this theme"
        yLabel="Theme name (grouped from user feedback)"
        note="Bar color reflects complaint signal — green is neutral/positive, amber/red indicates higher negative share."
      />
    </>
  );
}

interface ThemeDonutProps {
  themes: ThemeVolume[];
}

export function ThemeDonut({ themes }: ThemeDonutProps) {
  const data = themes.filter((t) => t.count > 0).map((t) => ({
    name: t.theme,
    value: t.count,
    fill: chartBarColor(t.negativePct),
  }));

  return (
    <>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={2}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: CHART.tooltipBg,
              border: `1px solid ${CHART.tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value, _name, props) => {
              const row = props.payload as { name?: string };
              const theme = themes.find((t) => t.theme === row.name);
              return [
                `${Number(value).toLocaleString()} · ${(theme?.negativePct ?? 0).toFixed(1)}% negative`,
                row.name,
              ];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 10, color: "#888" }}
            formatter={(value) =>
              value.length > 24 ? `${value.slice(0, 22)}…` : value
            }
          />
        </PieChart>
      </ResponsiveContainer>
      <ChartAxisLabels
        xLabel="Not applicable (radial chart)"
        yLabel="Slice size = share of total theme mentions among top themes"
        note="Each slice is a theme; larger slices mean more reviews discussed that topic."
      />
    </>
  );
}
