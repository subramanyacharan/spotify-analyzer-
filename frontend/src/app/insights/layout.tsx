import { DashboardShell } from "@/components/layout/DashboardShell";

export default async function InsightsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell title="Growth Intelligence">
      {children}
    </DashboardShell>
  );
}
