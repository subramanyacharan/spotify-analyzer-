import { computeConfidence } from "@/lib/confidence";
import { sanitizeInsightSummary } from "@/lib/copy/sanitize";
import { themeBarColor } from "@/lib/copy/terminology";
import { displayThemeName, prepareThemesForDisplay } from "@/lib/copy/theme-display";
import type { InsightAnswer } from "@/lib/insights/catalog";
import { ConfidenceBadge } from "../ui/ConfidenceBadge";
import { LowConfidenceDisclaimer } from "../ui/LowConfidenceDisclaimer";

interface SentimentBarProps {
  positive: number;
  neutral: number;
  negative: number;
}

function SentimentBar({ positive, neutral, negative }: SentimentBarProps) {
  const total = positive + neutral + negative || 1;
  const pPct = (positive / total) * 100;
  const nPct = (neutral / total) * 100;
  const negPct = (negative / total) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-zinc-800">
        <div className="bg-[#1db954]" style={{ width: `${pPct}%` }} title="Positive" />
        <div className="bg-zinc-500" style={{ width: `${nPct}%` }} title="Neutral" />
        <div className="bg-red-500" style={{ width: `${negPct}%` }} title="Negative" />
      </div>
      <div className="flex justify-between text-[10px] text-zinc-500">
        <span className="text-[#1db954]">{pPct.toFixed(0)}% positive</span>
        <span className="text-zinc-400">{nPct.toFixed(0)}% neutral</span>
        <span className="text-red-400">{negPct.toFixed(0)}% negative</span>
      </div>
    </div>
  );
}

interface InsightCardProps {
  insight: InsightAnswer;
}

export function InsightCard({ insight }: InsightCardProps) {
  const avgSeverity =
    insight.relatedClusters.length > 0
      ? insight.relatedClusters.reduce((s, c) => s + c.severity, 0) /
        insight.relatedClusters.length
      : undefined;

  const { level, factors } = computeConfidence({
    reviewCount: insight.reviewCount,
    avgClusterSeverity: avgSeverity,
    negativePct: insight.sentiment.negativePct,
    quoteCount: insight.quotes.length,
    hasClusterInsight: insight.relatedClusters.length > 0,
  });

  const visibleThemes = prepareThemesForDisplay(insight.topThemes, 4);
  const themeTotal =
    visibleThemes.reduce((sum, t) => sum + t.count, 0) || 1;

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">{insight.label}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">{insight.description}</p>
        </div>
        <ConfidenceBadge level={level} factors={factors} />
      </div>

      <LowConfidenceDisclaimer level={level} className="mb-3" />

      <p className="text-sm leading-relaxed text-zinc-300">
        {sanitizeInsightSummary(insight.findingSummary)}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Reviews matched" value={insight.reviewCount.toLocaleString()} />
        <Metric
          label="Negative feedback"
          value={`${insight.sentiment.negativePct.toFixed(1)}%`}
          accent={insight.sentiment.negativePct > 20 ? "text-red-400" : "text-zinc-200"}
        />
        {insight.avgRating !== undefined && (
          <Metric label="Avg rating" value={insight.avgRating.toFixed(2)} />
        )}
        <Metric
          label="Top audience"
          value={insight.segmentBreakdown[0]?.segment ?? "—"}
          sub={
            insight.segmentBreakdown[0]
              ? `${insight.segmentBreakdown[0].pct.toFixed(1)}% of signal`
              : undefined
          }
        />
      </div>

      <div className="mt-5">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Sentiment mix
        </p>
        <SentimentBar
          positive={insight.sentiment.positive}
          neutral={insight.sentiment.neutral}
          negative={insight.sentiment.negative}
        />
      </div>

      {visibleThemes.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Theme share
            </p>
            <div className="flex gap-3 text-[10px] text-zinc-600">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500/85" /> Complaint-heavy
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#1db954]/70" /> Neutral / positive
              </span>
            </div>
          </div>
          <div className="space-y-2.5">
            {visibleThemes.map((t) => {
              const sharePct = (t.count / themeTotal) * 100;
              return (
                <div key={t.theme} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 truncate text-xs text-zinc-400" title={displayThemeName(t.theme)}>
                    {displayThemeName(t.theme)}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-full rounded-full ${themeBarColor(t.theme, insight.sentiment.negativePct)}`}
                      style={{ width: `${sharePct}%` }}
                      title={`${sharePct.toFixed(1)}% of theme mentions`}
                    />
                  </div>
                  <span className="w-16 text-right text-xs">
                    <span className="font-medium text-zinc-300">{sharePct.toFixed(0)}%</span>
                    <span className="text-zinc-600"> · {t.count.toLocaleString()}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {insight.quotes.length > 0 && (
        <div className="mt-5 rounded-lg border border-zinc-800/80 bg-zinc-950/50 p-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            What users are saying
          </p>
          <ul className="space-y-1.5">
            {insight.quotes.slice(0, 3).map((q) => (
              <li key={q} className="text-xs italic text-zinc-400 before:content-['“'] after:content-['”']">
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {insight.affectedSegments.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {insight.affectedSegments.map((seg) => (
            <span
              key={seg}
              className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-[10px] text-zinc-400"
            >
              {seg}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function Metric({
  label,
  value,
  sub,
  accent = "text-white",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${accent}`}>{value}</p>
      {sub && <p className="text-[10px] text-zinc-600">{sub}</p>}
    </div>
  );
}
