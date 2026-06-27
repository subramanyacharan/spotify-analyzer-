"use client";

import { FilterProvider } from "../filters/FilterProvider";
import { ActiveFilterStrip, GlobalFilterBar } from "../filters/GlobalFilterBar";
import { useFilters } from "../filters/FilterProvider";
import { AuthProvider } from "../auth/AuthProvider";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

interface DashboardShellProps {
  children: React.ReactNode;
  title?: string;
}

function DashboardMain({ children, title }: DashboardShellProps) {
  const { panelOpen } = useFilters();

  return (
    <div className="flex h-screen overflow-hidden bg-[#0d0d0d]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar title={title} />
        <ActiveFilterStrip />
        {panelOpen && <GlobalFilterBar />}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

export function DashboardShell({ children, title }: DashboardShellProps) {
  return (
    <AuthProvider>
      <FilterProvider>
        <DashboardMain title={title}>{children}</DashboardMain>
      </FilterProvider>
    </AuthProvider>
  );
}
