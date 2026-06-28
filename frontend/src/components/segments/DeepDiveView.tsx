"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { computeConfidence } from "@/lib/confidence";
import { sanitizePainPoint, sanitizeRecommendation } from "@/lib/copy/sanitize";
import { displayThemeName, prepareThemesForDisplay } from "@/lib/copy/theme-display";
import { LENS_LABELS } from "@/lib/copy/terminology";
import type { SegmentProfile, SegmentationLens } from "@/lib/analytics/types";
import { ConfidenceBadge } from "../ui/ConfidenceBadge";
import { LowConfidenceDisclaimer } from "../ui/LowConfidenceDisclaimer";

interface DeepDiveViewProps {
  profile: SegmentProfile;
  lens: SegmentationLens;
}

export function DeepDiveView({ profile, lens }: DeepDiveViewProps) {
  const { level, factors } = computeConfidence({
    reviewCount: profile.reviewCount,
    avgClusterSeverity: profile.avgClusterSeverity,
    negativePct: profile.negativePct,
    quoteCount: profile.quotes.length,
    hasClusterInsight: profile.clusterOverlap.length > 0,
  });

  return (
    <div className="space-y-6 p-6">
      <Link
        href="/segments"
        className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-[#1db954]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to segments
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            {LENS_LABELS[lens]} profile
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">{profile.name}</h2>
          <p className="mt-1 text-sm text-zinc-400">{profile.profileSummary}</p>
        </div>
        <ConfidenceBadge level={level} factors={factors} />
      </div>

      <LowConfidenceDisclaimer level={level} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Reviews" value={profile.reviewCount.toLocaleString()} />
        <Stat label="Negative feedback" value={`${profile.negativePct.toFixed(1)}%`} />
        <Stat label="Friction score" value={profile.frictionScore.toFixed(2)} />
        <Stat label="Issue severity" value={`${profile.avgClusterSeverity.toFixed(1)}/5`} />
      </div>

      {profile.topThemes.length > 0 && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Top themes</h3>
          <ul className="space-y-2">
            {prepareThemesForDisplay(profile.topThemes, 4).map((t) => (
              <li key={t.theme} className="flex justify-between text-sm">
                <span className="text-zinc-300">{displayThemeName(t.theme)}</span>
                <span className="text-zinc-500">
                  {t.pct.toFixed(1)}% · {t.count.toLocaleString()} mentions
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile.topPainPoints.length > 0 && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Top pain points</h3>
          <ul className="space-y-3">
            {profile.topPainPoints.slice(0, 4).map((p) => (
              <li key={p.painPoint} className="text-sm text-zinc-400">
                <span className="text-zinc-200">{sanitizePainPoint(p.painPoint)}</span>
                <span className="ml-2 text-xs text-zinc-600">
                  {p.pct.toFixed(1)}% · {p.count.toLocaleString()} mentions
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile.clusterOverlap.length > 0 && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Related complaint themes</h3>
          <div className="space-y-2">
            {profile.clusterOverlap.slice(0, 4).map((c) => (
              <div
                key={c.clusterId}
                className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-xs"
              >
                <p className="font-medium text-zinc-300">
                  Severity {c.severity}/5 · {c.reviewCount.toLocaleString()} reviews
                </p>
                <p className="mt-1 text-zinc-500">{sanitizePainPoint(sanitizeRecommendation(c.painPoint))}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {profile.quotes.length > 0 && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">User quotes</h3>
          <ul className="space-y-2">
            {profile.quotes.slice(0, 5).map((q) => (
              <li key={q.slice(0, 40)} className="text-sm italic text-zinc-400">
                &ldquo;{q}&rdquo;
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
