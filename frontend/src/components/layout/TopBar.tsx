"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
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
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <h1 className="shrink-0 text-lg font-semibold text-white">{title}</h1>

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
      {exportError && (
        <p className="px-6 pb-3 text-sm text-red-400" role="alert">
          {exportError}
        </p>
      )}
    </header>
  );
}
