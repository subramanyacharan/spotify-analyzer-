import { DashboardShell } from "@/components/layout/DashboardShell";
import { OpportunitiesNav } from "@/components/opportunities/OpportunitiesNav";

export default async function OpportunitiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell title="Growth Intelligence">
      <OpportunitiesNav />
      {children}
    </DashboardShell>
  );
}
