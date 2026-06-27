import { computeConfidence } from "@/lib/confidence";
import { sanitizeInsightSummary, sanitizeRecommendation } from "@/lib/copy/sanitize";
import { DATA_FRESHNESS } from "@/lib/copy/terminology";
import type { OverviewData } from "@/lib/types";
import { ConfidenceBadge } from "../ui/ConfidenceBadge";
import { LowConfidenceDisclaimer } from "../ui/LowConfidenceDisclaimer";

interface ExecutiveSummaryProps {
  data: OverviewData;
}

export function ExecutiveSummary({ data }: ExecutiveSummaryProps) {
  const { executiveSummary } = data;
  const { level, factors } = computeConfidence({
    reviewCount: executiveSummary.reviewCount,
    avgClusterSeverity: executiveSummary.avgSeverity,
    negativePct: data.sentimentTrend.negativePct,
    quoteCount: executiveSummary.quotes.length,
    hasClusterInsight: true,
  });

  const summaryText = sanitizeRecommendation(
    sanitizeInsightSummary(executiveSummary.text)
  );

  const quoteBlock =
    executiveSummary.quotes.length > 0
      ? ` Users say: "${executiveSummary.quotes.slice(0, 2).join('" · "')}".`
      : "";

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-white">
          Key finding this period
        </h2>
        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400">
          {executiveSummary.tier}
        </span>
        <ConfidenceBadge level={level} factors={factors} />
      </div>

      <LowConfidenceDisclaimer level={level} className="mb-3" />

      <p className="text-sm leading-relaxed text-zinc-300">
        {summaryText}
        {quoteBlock}
      </p>

      <p className="mt-3 text-[10px] text-zinc-600">
        {DATA_FRESHNESS(data.dataSource, data.generatedAt)}
      </p>
    </section>
  );
}
