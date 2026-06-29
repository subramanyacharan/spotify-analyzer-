"use client";

import { useState } from "react";
import { Bell, Calendar, Download, Globe, Loader2, Search } from "lucide-react";
import { genericExportError } from "@/lib/auth/user-messages";
import type { ExportReportDocument } from "@/lib/reports/export-document";
import { downloadReportPdf } from "@/lib/reports/generate-pdf";

interface TopBarProps {
  title?: string;
}

export function TopBar({ title = "Growth Intelligence" }: TopBarProps) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const handleExport = async () => {
    if (exporting) return;
    setExportError("");
    setExporting(true);
    try {
      const res = await fetch("/api/export/report");
      if (!res.ok) throw new Error(genericExportError());
      const report = (await res.json()) as ExportReportDocument;
      await downloadReportPdf(report);
    } catch {
      setExportError(genericExportError());
    } finally {
      setExporting(false);
    }
  };

  return (
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
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 rounded-lg bg-[#1db954] px-4 py-2 text-sm font-medium text-black transition hover:bg-[#1ed760] disabled:opacity-60"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {exporting ? "Preparing…" : "Export Report"}
          </button>
        </div>
      </div>
      {exportError && (
        <p className="px-6 pb-3 text-sm text-red-400" role="alert">
          {exportError}
        </p>
      )}
    </header>
  );
}
