import { DashboardShell } from "@/components/layout/DashboardShell";
import { InsightsNav } from "@/components/insights/InsightsNav";
import { requireAuth } from "@/lib/auth/server";

export default async function InsightsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth("/insights");

  return (
    <DashboardShell title="Growth Intelligence">
      <InsightsNav />
      {children}
    </DashboardShell>
  );
}
