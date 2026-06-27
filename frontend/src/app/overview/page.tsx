import { DashboardShell } from "@/components/layout/DashboardShell";
import { OverviewView } from "@/components/overview/OverviewView";
import { requireAuth } from "@/lib/auth/server";
import { getOverviewData } from "@/lib/data/overview";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  await requireAuth("/overview");
  const data = await getOverviewData();

  return (
    <DashboardShell title="Growth Intelligence">
      <OverviewView data={data} />
    </DashboardShell>
  );
}
