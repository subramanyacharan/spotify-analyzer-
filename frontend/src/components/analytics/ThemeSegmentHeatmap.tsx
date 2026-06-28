"use client";

import type { HeatmapCell } from "@/lib/analytics/types";

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
  if (!segments.length || !themes.length) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-zinc-500">
        No heatmap data available.
      </div>
    );
  }

  const getCell = (segment: string, theme: string) =>
    cells.find((c) => c.segment === segment && c.theme === theme);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-zinc-900/95 p-2 text-left text-zinc-500">
              Theme
            </th>
            {segments.map((seg) => (
              <th
                key={seg}
                className="max-w-[88px] truncate p-2 text-center text-zinc-500"
                title={seg}
              >
                {seg.split(" ")[0]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {themes.map((theme) => (
            <tr key={theme} className="border-t border-zinc-800/80">
              <td
                className="sticky left-0 z-10 max-w-[140px] truncate bg-zinc-900/95 p-2 font-medium text-zinc-300"
                title={theme}
              >
                {theme}
              </td>
              {segments.map((seg) => {
                const cell = getCell(seg, theme);
                const intensity = cell?.intensity ?? 0;
                return (
                  <td key={`${theme}-${seg}`} className="p-1">
                    <div
                      className="flex h-8 items-center justify-center rounded text-[10px] text-zinc-300"
                      style={{
                        background: `rgba(29, 185, 84, ${Math.max(intensity * 0.85, 0.04)})`,
                      }}
                      title={
                        cell?.value
                          ? `${theme} · ${seg}: ${cell.value.toLocaleString()} mentions`
                          : "No signal"
                      }
                    >
                      {cell?.value
                        ? cell.value > 999
                          ? `${Math.round(cell.value / 1000)}k`
                          : cell.value
                        : "—"}
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
