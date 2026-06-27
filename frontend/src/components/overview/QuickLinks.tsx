import Link from "next/link";
import { ArrowRight, Lightbulb, Target } from "lucide-react";
import { sanitizeRecommendation } from "@/lib/copy/sanitize";
import type { OverviewData } from "@/lib/types";

interface QuickLinksProps {
  data: OverviewData;
}

export function QuickLinks({ data }: QuickLinksProps) {
  const topOpp = data.topOpportunity;

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Link
        href="/insights"
        className="group flex items-start gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition hover:border-[#1db954]/40 hover:bg-zinc-900/70"
      >
        <div className="rounded-lg bg-[#1db954]/15 p-2">
          <Lightbulb className="h-5 w-5 text-[#1db954]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white">User feedback insights</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Discovery blockers, recommendation quality, and listening habits.
          </p>
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-zinc-600 transition group-hover:text-[#1db954]" />
      </Link>

      <Link
        href="/opportunities"
        className="group flex items-start gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition hover:border-[#1db954]/40 hover:bg-zinc-900/70"
      >
        <div className="rounded-lg bg-[#1db954]/15 p-2">
          <Target className="h-5 w-5 text-[#1db954]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white">Priority opportunity</h3>
          <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
            {topOpp
              ? `#${topOpp.rank} ${topOpp.tier}: ${sanitizeRecommendation(topOpp.painPoint)}`
              : "View ranked product opportunities"}
          </p>
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-zinc-600 transition group-hover:text-[#1db954]" />
      </Link>
    </section>
  );
}
