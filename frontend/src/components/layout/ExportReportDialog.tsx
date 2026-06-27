"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { genericExportError } from "@/lib/auth/user-messages";
import type { ExportReportDocument } from "@/lib/reports/export-document";
import { downloadReportPdf } from "@/lib/reports/generate-pdf";

const WEEK_OPTIONS = [1, 2, 4, 8, 12];

interface ExportReportDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ExportReportDialog({ open, onClose }: ExportReportDialogProps) {
  const [weeks, setWeeks] = useState(4);
  const [maxWeeks, setMaxWeeks] = useState(12);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    void fetch("/api/export/report?weeks=1")
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.availableWeeks === "number" && data.availableWeeks > 0) {
          setMaxWeeks(Math.min(12, data.availableWeeks));
        }
      })
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const handleDownload = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/export/report?weeks=${weeks}`);
      if (!res.ok) throw new Error(genericExportError());
      const report = (await res.json()) as ExportReportDocument;
      await downloadReportPdf(report);
      onClose();
    } catch {
      setError(genericExportError());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-md rounded-xl border border-zinc-800 bg-[#141414] p-6 shadow-xl"
        role="dialog"
        aria-labelledby="export-report-title"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 id="export-report-title" className="text-lg font-semibold text-white">
              Export Report
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Download a PDF summary with methodology, rankings, and priorities.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:text-zinc-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="block">
          <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
            Weeks to include
          </span>
          <select
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            disabled={loading}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 focus:border-[#1db954]/50 focus:outline-none"
          >
            {WEEK_OPTIONS.filter((w) => w <= maxWeeks).map((w) => (
              <option key={w} value={w}>
                Last {w} week{w > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-zinc-700 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#1db954] py-2.5 text-sm font-medium text-black hover:bg-[#1ed760] disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {loading ? "Preparing…" : "Download PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
