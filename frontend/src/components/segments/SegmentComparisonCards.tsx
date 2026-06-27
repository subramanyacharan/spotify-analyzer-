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
      <SegmentCard
        label="Segment A"
        profile={segmentA}
        indexLabel="Friction index"
        indexValue={segmentA.frictionScore.toFixed(2)}
        indexLow={segmentA.frictionScore < 0.65}
      />
      <SegmentCard
        label="Segment B"
        profile={segmentB}
        indexLabel="Engagement index"
        indexValue={(1 - segmentB.negativePct / 100).toFixed(2)}
        indexLow={segmentB.negativePct > 25}
      />
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-center">
        <p className="text-3xl font-bold text-[#1db954]">
          {varianceDeltaPct >= 0 ? "+" : ""}
          {varianceDeltaPct}%
        </p>
        <p className="mt-1 text-xs text-zinc-500">Delta in discovery adoption</p>
      </div>
    </div>
  );
}

function SegmentCard({
  label,
  profile,
  indexLabel,
  indexValue,
  indexLow,
}: {
  label: string;
  profile: SegmentProfile;
  indexLabel: string;
  indexValue: string;
  indexLow: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{profile.name}</p>
      <p className="text-xs text-zinc-500">{formatUsers(profile.reviewCount)} reviews</p>
      <p className="mt-2 line-clamp-2 text-xs text-zinc-400">
        {profile.profileSummary.slice(0, 100)}…
      </p>
      <div className="mt-3">
        <div className="flex justify-between text-[10px] text-zinc-500">
          <span>{indexLabel}</span>
          <span className={indexLow ? "text-red-400" : "text-[#1db954]"}>
            {indexLow ? "Low" : "High"} ({indexValue})
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full rounded-full ${indexLow ? "bg-red-500/70" : "bg-[#1db954]"}`}
            style={{ width: `${Math.min(parseFloat(indexValue) * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
