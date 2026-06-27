import type { ExportReportDocument } from "./export-document";

type JsPDFInstance = import("jspdf").jsPDF;

function wrapText(doc: JsPDFInstance, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[];
}

function addSection(
  doc: JsPDFInstance,
  title: string,
  body: string,
  y: number,
  margin: number,
  maxWidth: number
): number {
  if (y > 260) {
    doc.addPage();
    y = 20;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title, margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const lines = wrapText(doc, body, maxWidth);
  for (const line of lines) {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, margin, y);
    y += 5;
  }
  return y + 4;
}

export async function downloadReportPdf(
  report: ExportReportDocument,
  filename?: string
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 16;
  const maxWidth = 178;
  let y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(report.title, margin, y);
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Period: ${report.periodLabel}`, margin, y);
  y += 5;
  doc.text(`Reviews analyzed: ${report.totalReviews.toLocaleString()}`, margin, y);
  y += 5;
  doc.text(`Weeks covered: ${report.weekCount}`, margin, y);
  y += 5;
  doc.text(`Confidence: ${report.confidenceLevel}`, margin, y);
  y += 10;

  y = addSection(doc, "Executive summary", report.executiveSummary, y, margin, maxWidth);

  y = addSection(
    doc,
    "How we analyzed this",
    report.methodology.overview,
    y,
    margin,
    maxWidth
  );
  for (const step of report.methodology.steps) {
    y = addSection(doc, "", `• ${step}`, y, margin, maxWidth);
  }

  y = addSection(
    doc,
    "How rankings were calculated",
    report.methodology.ranking,
    y,
    margin,
    maxWidth
  );

  y = addSection(
    doc,
    "How priorities were set",
    report.methodology.prioritization,
    y,
    margin,
    maxWidth
  );

  y = addSection(
    doc,
    "Confidence",
    report.methodology.confidence,
    y,
    margin,
    maxWidth
  );

  if (report.keyFindings.length) {
    y = addSection(
      doc,
      "Key findings",
      report.keyFindings.map((f, i) => `${i + 1}. ${f}`).join("\n\n"),
      y,
      margin,
      maxWidth
    );
  }

  if (report.topThemes.length) {
    const themes = report.topThemes
      .slice(0, 8)
      .map((t, i) => `${i + 1}. ${t.theme} — ${t.count.toLocaleString()} mentions`)
      .join("\n");
    y = addSection(doc, "Top themes", themes, y, margin, maxWidth);
  }

  if (report.topPainPoints.length) {
    const pains = report.topPainPoints
      .slice(0, 5)
      .map(
        (p, i) =>
          `${i + 1}. ${p.painPoint.slice(0, 120)}${p.painPoint.length > 120 ? "…" : ""} (${p.frequency.toLocaleString()} reviews)`
      )
      .join("\n\n");
    y = addSection(doc, "Top pain points", pains, y, margin, maxWidth);
  }

  if (report.priorities.length) {
    const pri = report.priorities
      .map((p) => `${p.rank}. [${p.tier}] ${p.title}\n   ${p.why}`)
      .join("\n\n");
    y = addSection(doc, "Priority actions", pri, y, margin, maxWidth);
  }

  if (report.weeklySnapshots.length) {
    const weeks = report.weeklySnapshots
      .map(
        (w) =>
          `${w.label}: ${w.reviewCount.toLocaleString()} reviews, ${w.negativePct.toFixed(1)}% negative`
      )
      .join("\n");
    y = addSection(doc, "Weekly snapshot", weeks, y, margin, maxWidth);
  }

  const name =
    filename ??
    `growth-intelligence-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(name);
}
