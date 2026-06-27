"use client";

import Link from "next/link";
import { ArrowRight, TrendingUp } from "lucide-react";
import type { SegmentsData, SegmentationLens } from "@/lib/analytics/types";

interface SubClusterTableProps {
  subClusters: SegmentsData["subClusters"];
  lens: SegmentationLens;
}

const RISK_STYLES = {
  LOW: "bg-[#1db954]/15 text-[#1db954] border-[#1db954]/30",
  MEDIUM: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  HIGH: "bg-red-500/15 text-red-400 border-red-500/30",
};

export function SubClusterTable({ subClusters, lens }: SubClusterTableProps) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Audience segment performance
        </h3>
        <span className="text-[10px] text-zinc-600">Ranked by volume</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[10px] uppercase tracking-wider text-zinc-500">
              <th className="pb-3 pr-4">Sub-segment</th>
              <th className="pb-3 pr-4">Growth trend</th>
              <th className="pb-3 pr-4">Churn risk</th>
              <th className="pb-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {subClusters.map((row) => (
              <tr key={row.name} className="border-b border-zinc-800/60">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#1db954]" />
                    <span className="font-medium text-zinc-200">{row.name}</span>
                  </div>
                  <span className="text-[10px] text-zinc-600">
                    {row.reviewCount.toLocaleString()} reviews
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <span className="inline-flex items-center gap-1 text-[#1db954]">
                    <TrendingUp className="h-3 w-3" />+{row.growthTrendPct.toFixed(1)}%
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${RISK_STYLES[row.churnRisk]}`}
                  >
                    {row.churnRisk}
                  </span>
                </td>
                <td className="py-3">
                  <Link
                    href={`/deep-dive?segment=${encodeURIComponent(row.name)}&lens=${lens}`}
                    className="inline-flex rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-[#1db954]"
                    aria-label={`Deep dive ${row.name}`}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
