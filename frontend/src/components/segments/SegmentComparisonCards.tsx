import type { SegmentProfile } from "@/lib/analytics/types";

interface SegmentComparisonCardsProps {
  segmentA: SegmentProfile;
  segmentB: SegmentProfile;
  varianceDeltaPct: number;
}

function formatUsers(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toLocaleString();
}

export function SegmentComparisonCards({
  segmentA,
  segmentB,
  varianceDeltaPct,
}: SegmentComparisonCardsProps) {
  return (
    <div className="flex flex-col gap-3">
      <SegmentCard label="Cohort A" profile={segmentA} />
      <SegmentCard label="Cohort B" profile={segmentB} />
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-center">
        <p className="text-3xl font-bold text-[#1db954]">
          {varianceDeltaPct >= 0 ? "+" : ""}
          {varianceDeltaPct}%
        </p>
        <p className="mt-1 text-xs text-zinc-500">Friction gap between selected cohorts</p>
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
          Positive % means Cohort A has higher friction than Cohort B based on negative review share.
        </p>
      </div>
    </div>
  );
}

function SegmentCard({ label, profile }: { label: string; profile: SegmentProfile }) {
  const frictionHigh = profile.frictionScore >= 0.25;
  const satisfaction = 1 - profile.negativePct / 100;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{profile.name}</p>
      <p className="text-xs text-zinc-500">{formatUsers(profile.reviewCount)} reviews</p>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">
        {profile.profileSummary || "No summary available for this cohort."}
      </p>
      <div className="mt-3 space-y-2">
        <MetricBar
          label="Friction index"
          value={profile.frictionScore}
          display={`${(profile.frictionScore * 100).toFixed(0)}%`}
          warn={frictionHigh}
          hint="Share of negative reviews"
        />
        <MetricBar
          label="Satisfaction index"
          value={satisfaction}
          display={`${(satisfaction * 100).toFixed(0)}%`}
          warn={satisfaction < 0.75}
          hint="Inverse of negative feedback"
        />
        <p className="text-[10px] text-zinc-600">
          {profile.negativePct.toFixed(1)}% of reviews in this cohort are negative
        </p>
      </div>
    </div>
  );
}

function MetricBar({
  label,
  value,
  display,
  warn,
  hint,
}: {
  label: string;
  value: number;
  display: string;
  warn: boolean;
  hint: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-zinc-500">
        <span>
          {label} <span className="text-zinc-600">({hint})</span>
        </span>
        <span className={warn ? "text-red-400" : "text-[#1db954]"}>{display}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full ${warn ? "bg-red-500/70" : "bg-[#1db954]"}`}
          style={{ width: `${Math.min(value * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}
