import { DashboardShell } from "@/components/layout/DashboardShell";
import { SegmentsView } from "@/components/segments/SegmentsView";
import { getSegmentsData } from "@/lib/data/segments";

export const dynamic = "force-dynamic";

export default async function SegmentsPage() {
  const data = await getSegmentsData();

  return (
    <DashboardShell title="Growth Intelligence">
      <SegmentsView data={data} />
    </DashboardShell>
  );
}
