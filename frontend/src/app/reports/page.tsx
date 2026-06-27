import { DashboardShell } from "@/components/layout/DashboardShell";
import { WeeklyReportsView } from "@/components/reports/WeeklyReportsView";
import { requireAuth } from "@/lib/auth/server";
import { getWeeklyReportsCatalog } from "@/lib/data/weekly-reports";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requireAuth("/reports");
  const catalog = await getWeeklyReportsCatalog();

  return (
    <DashboardShell title="Growth Intelligence">
      <WeeklyReportsView catalog={catalog} />
    </DashboardShell>
  );
}
