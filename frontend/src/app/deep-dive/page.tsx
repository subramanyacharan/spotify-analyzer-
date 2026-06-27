import { DashboardShell } from "@/components/layout/DashboardShell";
import { DeepDiveView } from "@/components/segments/DeepDiveView";
import type { SegmentationLens, SegmentProfile } from "@/lib/analytics/types";
import { requireAuth } from "@/lib/auth/server";
import { getSegmentsData } from "@/lib/data/segments";

export const dynamic = "force-dynamic";

function findProfile(
  profilesByLens: Record<SegmentationLens, SegmentProfile[]>,
  segmentName: string,
  lens: SegmentationLens
): SegmentProfile | null {
  const inLens = profilesByLens[lens]?.find(
    (p) => p.name.toLowerCase() === segmentName.toLowerCase()
  );
  if (inLens) return inLens;

  for (const profiles of Object.values(profilesByLens)) {
    const match = profiles.find(
      (p) => p.name.toLowerCase() === segmentName.toLowerCase()
    );
    if (match) return match;
  }
  return profilesByLens.behavior[0] ?? null;
}

export default async function DeepDivePage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string; lens?: string }>;
}) {
  await requireAuth("/deep-dive");
  const params = await searchParams;
  const data = await getSegmentsData();
  const lens = (params.lens ?? "behavior") as SegmentationLens;
  const segmentName = params.segment ?? data.highestFrictionSegment;
  const profile = findProfile(data.profilesByLens, segmentName, lens);

  if (!profile) {
    return (
      <DashboardShell title="Growth Intelligence">
        <div className="p-6 text-sm text-zinc-500">Segment not found.</div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Growth Intelligence">
      <DeepDiveView profile={profile} lens={lens} />
    </DashboardShell>
  );
}
