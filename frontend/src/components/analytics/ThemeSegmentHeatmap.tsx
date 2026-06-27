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
      <table className="w-full min-w-[520px] border-collapse text-xs">
        <thead>
          <tr>
            <th className="p-2 text-left text-zinc-500">Segment</th>
            {themes.map((t) => (
              <th
                key={t}
                className="max-w-[72px] truncate p-2 text-center text-zinc-500"
                title={t}
              >
                {t.split(" ")[0]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {segments.map((seg) => (
            <tr key={seg} className="border-t border-zinc-800/80">
              <td className="whitespace-nowrap p-2 font-medium text-zinc-300">{seg}</td>
              {themes.map((theme) => {
                const cell = getCell(seg, theme);
                const intensity = cell?.intensity ?? 0;
                return (
                  <td key={theme} className="p-1">
                    <div
                      className="flex h-8 items-center justify-center rounded text-[10px] text-zinc-300"
                      style={{
                        background: `rgba(29, 185, 84, ${Math.max(intensity * 0.85, 0.04)})`,
                      }}
                      title={
                        cell?.value
                          ? `${seg} · ${theme}: ${cell.value.toLocaleString()}`
                          : "No signal"
                      }
                    >
                      {cell?.value ? (cell.value > 999 ? `${Math.round(cell.value / 1000)}k` : cell.value) : "—"}
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
