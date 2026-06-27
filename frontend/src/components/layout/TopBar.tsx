"use client";

import { useState } from "react";
import { Bell, Calendar, Download, Globe, Loader2, Search } from "lucide-react";
import { ExportReportDialog } from "./ExportReportDialog";

interface TopBarProps {
  title?: string;
}

export function TopBar({ title = "Growth Intelligence" }: TopBarProps) {
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <>
      <header className="flex flex-col border-b border-zinc-800 bg-[#0d0d0d]">
        <div className="flex items-center gap-4 px-6 py-4">
          <h1 className="shrink-0 text-lg font-semibold text-white">{title}</h1>

          <div className="relative mx-auto max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              placeholder="Search themes, audiences, insights..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 py-2 pl-10 pr-4 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-[#1db954]/50 focus:outline-none focus:ring-1 focus:ring-[#1db954]/30"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Calendar"
            >
              <Calendar className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Region"
            >
              <Globe className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-[#1db954] px-4 py-2 text-sm font-medium text-black transition hover:bg-[#1ed760]"
            >
              <Download className="h-4 w-4" />
              Export Report
            </button>
          </div>
        </div>
      </header>

      <ExportReportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </>
  );
}
