import { DashboardShell } from "@/components/layout/DashboardShell";
import { OpportunitiesNav } from "@/components/opportunities/OpportunitiesNav";
import { requireAuth } from "@/lib/auth/server";

export default async function OpportunitiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth("/opportunities");

  return (
    <DashboardShell title="Growth Intelligence">
      <OpportunitiesNav />
      {children}
    </DashboardShell>
  );
}
