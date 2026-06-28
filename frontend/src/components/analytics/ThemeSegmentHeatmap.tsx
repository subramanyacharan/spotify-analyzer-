"use client";

import { useMemo } from "react";
import type { HeatmapCell } from "@/lib/analytics/types";
import { formatHeatmapCount } from "@/lib/data/analytics-heatmap";

interface ThemeSegmentHeatmapProps {
  cells: HeatmapCell[];
  segments: string[];
  themes: string[];
}

export function ThemeSegmentHeatmap({
  cells,
  segments,
  themes,
}: ThemeSegmentHeatmapProps) {
  const { peakValue, cellMap } = useMemo(() => {
    let peak = 0;
    const map = new Map<string, HeatmapCell>();
    for (const cell of cells) {
      map.set(`${cell.theme}::${cell.segment}`, cell);
      if (cell.value > peak) peak = cell.value;
    }
    return { peakValue: peak, cellMap: map };
  }, [cells]);

  if (!segments.length || !themes.length) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-zinc-500">
        No heatmap data available.
      </div>
    );
  }

  const segmentLabel = (seg: string) => {
    const short = seg.split(" ")[0];
    return short.length > 8 ? `${short.slice(0, 7)}…` : short;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-zinc-900/95 p-2 text-left text-zinc-500">
              Theme
            </th>
            {segments.map((seg) => (
              <th
                key={seg}
                className="min-w-[72px] p-2 text-center text-zinc-500"
                title={seg}
              >
                {segmentLabel(seg)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {themes.map((theme) => (
            <tr key={theme} className="border-t border-zinc-800/80">
              <td
                className="sticky left-0 z-10 max-w-[160px] truncate bg-zinc-900/95 p-2 font-medium text-zinc-300"
                title={theme}
              >
                {theme}
              </td>
              {segments.map((seg) => {
                const cell = cellMap.get(`${theme}::${seg}`);
                const value = cell?.value ?? 0;
                const intensity = cell?.intensity ?? 0;
                const isPeak = peakValue > 0 && value === peakValue;

                return (
                  <td key={`${theme}-${seg}`} className="p-1">
                    <div
                      className={`flex h-9 items-center justify-center rounded text-[11px] tabular-nums ${
                        isPeak
                          ? "font-bold text-white ring-2 ring-[#1db954] ring-offset-1 ring-offset-zinc-900"
                          : value > 0
                            ? "font-medium text-zinc-200"
                            : "text-zinc-600"
                      }`}
                      style={{
                        background: isPeak
                          ? "rgba(29, 185, 84, 0.95)"
                          : value > 0
                            ? `rgba(29, 185, 84, ${Math.max(intensity * 0.82, 0.12)})`
                            : "rgba(39, 39, 42, 0.55)",
                      }}
                      title={`${theme} · ${seg}: ${value.toLocaleString()} review mentions${
                        isPeak ? " (highest)" : ""
                      }`}
                    >
                      {formatHeatmapCount(value)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
