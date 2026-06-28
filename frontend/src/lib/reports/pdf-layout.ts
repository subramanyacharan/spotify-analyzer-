import type { ExportReportDocument, ReportMetric } from "./export-document";

type JsPDF = import("jspdf").jsPDF;

export const PDF = {
  margin: 18,
  pageW: 210,
  pageH: 297,
  contentW: 174,
  brand: { r: 29, g: 185, b: 84 },
  dark: { r: 24, g: 24, b: 27 },
  muted: { r: 113, g: 113, b: 122 },
  line: { r: 63, g: 63, b: 70 },
};

export class PdfBuilder {
  doc: JsPDF;
  y: number;
  pageNum = 1;

  constructor(doc: JsPDF) {
    this.doc = doc;
    this.y = 20;
  }

  wrap(text: string, maxWidth = PDF.contentW): string[] {
    return this.doc.splitTextToSize(text, maxWidth) as string[];
  }

  ensure(minBottom = 24): void {
    if (this.y > PDF.pageH - minBottom) {
      this.newPage();
    }
  }

  newPage(): void {
    this.doc.addPage();
    this.pageNum += 1;
    this.drawFooter();
    this.y = 22;
  }

  drawFooter(): void {
    const { doc } = this;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(PDF.muted.r, PDF.muted.g, PDF.muted.b);
    doc.text(
      `Product Research Report · Confidential · Page ${this.pageNum}`,
      PDF.margin,
      PDF.pageH - 10
    );
  }

  cover(report: ExportReportDocument): void {
    const { doc } = this;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(PDF.dark.r, PDF.dark.g, PDF.dark.b);
    doc.text(report.meta.title, PDF.margin, 32);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(PDF.muted.r, PDF.muted.g, PDF.muted.b);
    doc.text(report.meta.subtitle, PDF.margin, 42);

    doc.setDrawColor(PDF.line.r, PDF.line.g, PDF.line.b);
    doc.line(PDF.margin, 50, PDF.margin + PDF.contentW, 50);

    this.y = 62;
    doc.setTextColor(PDF.dark.r, PDF.dark.g, PDF.dark.b);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Reporting period", PDF.margin, this.y);
    this.y += 7;
    doc.setFont("helvetica", "normal");
    doc.text(report.meta.periodLabel, PDF.margin, this.y);
    this.y += 12;
    doc.setFont("helvetica", "bold");
    doc.text("Scope", PDF.margin, this.y);
    this.y += 7;
    doc.setFont("helvetica", "normal");
    doc.text(
      `${report.meta.totalReviews.toLocaleString()} reviews · ${report.meta.weekCount} week(s) · Confidence: ${report.meta.confidenceLevel}`,
      PDF.margin,
      this.y
    );
    this.y += 12;
    doc.setFont("helvetica", "bold");
    doc.text("Generated", PDF.margin, this.y);
    this.y += 7;
    doc.setFont("helvetica", "normal");
    doc.text(
      new Date(report.meta.generatedAt).toLocaleString(undefined, {
        dateStyle: "long",
        timeStyle: "short",
      }),
      PDF.margin,
      this.y
    );
    this.y += 16;
    doc.setFontSize(9);
    doc.setTextColor(PDF.muted.r, PDF.muted.g, PDF.muted.b);
    const note = this.wrap(
      "This report presents analyzer findings only — segments, themes, pain points, behaviors, and opportunities ranked with supporting metrics. Rankings explain why each item appears above the next."
    );
    for (const line of note) {
      doc.text(line, PDF.margin, this.y);
      this.y += 5;
    }
    this.y += 8;
    this.drawFooter();
    this.newPage();
  }

  section(num: number, title: string, subtitle?: string): void {
    this.ensure(30);
    const { doc } = this;
    doc.setFillColor(PDF.brand.r, PDF.brand.g, PDF.brand.b);
    doc.rect(PDF.margin, this.y - 4, 3, 10, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(PDF.dark.r, PDF.dark.g, PDF.dark.b);
    doc.text(`${num}. ${title}`, PDF.margin + 6, this.y + 3);
    this.y += 10;
    if (subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(PDF.muted.r, PDF.muted.g, PDF.muted.b);
      for (const line of this.wrap(subtitle)) {
        doc.text(line, PDF.margin, this.y);
        this.y += 4.5;
      }
      this.y += 4;
    }
  }

  subheading(title: string): void {
    this.ensure(16);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(10);
    this.doc.setTextColor(PDF.dark.r, PDF.dark.g, PDF.dark.b);
    this.doc.text(title, PDF.margin, this.y);
    this.y += 7;
  }

  body(text: string, indent = 0): void {
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(9);
    this.doc.setTextColor(50, 50, 50);
    for (const line of this.wrap(text, PDF.contentW - indent)) {
      this.ensure(8);
      this.doc.text(line, PDF.margin + indent, this.y);
      this.y += 4.5;
    }
    this.y += 3;
  }

  bullets(items: string[]): void {
    for (const item of items) {
      this.ensure(10);
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(9);
      this.doc.text("•", PDF.margin + 2, this.y);
      this.doc.setFont("helvetica", "normal");
      for (const line of this.wrap(item, PDF.contentW - 8)) {
        this.doc.text(line, PDF.margin + 8, this.y);
        this.y += 4.5;
      }
      this.y += 2;
    }
    this.y += 2;
  }

  scorecards(metrics: ReportMetric[], cols = 3): void {
    this.ensure(28);
    const colW = PDF.contentW / cols;
    const startY = this.y;
    metrics.forEach((m, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = PDF.margin + col * colW;
      const y = startY + row * 22;
      this.doc.setDrawColor(PDF.line.r, PDF.line.g, PDF.line.b);
      this.doc.setFillColor(248, 248, 250);
      this.doc.roundedRect(x, y, colW - 4, 18, 2, 2, "FD");
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(7);
      this.doc.setTextColor(PDF.muted.r, PDF.muted.g, PDF.muted.b);
      this.doc.text(m.label.toUpperCase(), x + 3, y + 6);
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(11);
      this.doc.setTextColor(PDF.dark.r, PDF.dark.g, PDF.dark.b);
      this.doc.text(m.value, x + 3, y + 13);
    });
    const rows = Math.ceil(metrics.length / cols);
    this.y = startY + rows * 22 + 6;
  }

  table(headers: string[], rows: string[][], colWidths?: number[]): void {
    const widths =
      colWidths ??
      headers.map(() => PDF.contentW / headers.length);
    const rowH = 7;
    this.ensure(rowH * (rows.length + 2) + 4);

    let x = PDF.margin;
    this.doc.setFillColor(PDF.dark.r, PDF.dark.g, PDF.dark.b);
    this.doc.rect(PDF.margin, this.y, PDF.contentW, rowH, "F");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(7);
    this.doc.setTextColor(255, 255, 255);
    headers.forEach((h, i) => {
      this.doc.text(h, x + 2, this.y + 5);
      x += widths[i];
    });
    this.y += rowH;

    rows.forEach((row, ri) => {
      this.ensure(rowH + 4);
      x = PDF.margin;
      if (ri % 2 === 0) {
        this.doc.setFillColor(245, 245, 247);
        this.doc.rect(PDF.margin, this.y, PDF.contentW, rowH, "F");
      }
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(7);
      this.doc.setTextColor(50, 50, 50);
      row.forEach((cell, ci) => {
        const clipped = cell.length > 42 ? `${cell.slice(0, 40)}…` : cell;
        this.doc.text(clipped, x + 2, this.y + 5);
        x += widths[ci];
      });
      this.y += rowH;
    });
    this.y += 6;
  }

  rankingBlock(rank: number, title: string, proof: string, metrics: ReportMetric[]): void {
    this.ensure(40);
    this.doc.setDrawColor(PDF.brand.r, PDF.brand.g, PDF.brand.b);
    this.doc.setLineWidth(0.4);
    this.doc.line(PDF.margin, this.y, PDF.margin + PDF.contentW, this.y);
    this.y += 5;
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(10);
    this.doc.setTextColor(PDF.brand.r, PDF.brand.g, PDF.brand.b);
    this.doc.text(`#${rank}`, PDF.margin, this.y);
    this.doc.setTextColor(PDF.dark.r, PDF.dark.g, PDF.dark.b);
    for (const line of this.wrap(title, PDF.contentW - 12)) {
      this.doc.text(line, PDF.margin + 10, this.y);
      this.y += 5;
    }
    this.y += 2;
    this.doc.setFont("helvetica", "italic");
    this.doc.setFontSize(8);
    this.doc.setTextColor(PDF.muted.r, PDF.muted.g, PDF.muted.b);
    for (const line of this.wrap(`Why this rank: ${proof}`)) {
      this.ensure(6);
      this.doc.text(line, PDF.margin, this.y);
      this.y += 4;
    }
    this.y += 3;
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(7);
    this.doc.setTextColor(50, 50, 50);
    const metricLine = metrics.map((m) => `${m.label}: ${m.value}`).join("  ·  ");
    for (const line of this.wrap(metricLine)) {
      this.doc.text(line, PDF.margin, this.y);
      this.y += 4;
    }
    this.y += 6;
  }

  barChart(
    title: string,
    items: { label: string; value: number; display: string }[],
    maxValue?: number
  ): void {
    this.subheading(title);
    const max = maxValue ?? Math.max(...items.map((i) => i.value), 0.01);
    const barMaxW = PDF.contentW - 50;
    for (const item of items.slice(0, 8)) {
      this.ensure(12);
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(7);
      this.doc.setTextColor(50, 50, 50);
      const label = item.label.length > 22 ? `${item.label.slice(0, 20)}…` : item.label;
      this.doc.text(label, PDF.margin, this.y + 3);
      const barW = (item.value / max) * barMaxW;
      this.doc.setFillColor(PDF.brand.r, PDF.brand.g, PDF.brand.b);
      this.doc.rect(PDF.margin + 48, this.y - 2, barW, 5, "F");
      this.doc.setFont("helvetica", "bold");
      this.doc.text(item.display, PDF.margin + 50 + barW + 2, this.y + 3);
      this.y += 8;
    }
    this.y += 4;
  }

  callout(title: string, body: string): void {
    this.ensure(30);
    this.doc.setFillColor(240, 253, 244);
    this.doc.setDrawColor(PDF.brand.r, PDF.brand.g, PDF.brand.b);
    const lines = this.wrap(body);
    const h = 12 + lines.length * 4.5;
    this.doc.roundedRect(PDF.margin, this.y, PDF.contentW, h, 2, 2, "FD");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(9);
    this.doc.setTextColor(PDF.brand.r, PDF.brand.g, PDF.brand.b);
    this.doc.text(title, PDF.margin + 4, this.y + 7);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8);
    this.doc.setTextColor(50, 50, 50);
    let ly = this.y + 13;
    for (const line of lines) {
      this.doc.text(line, PDF.margin + 4, ly);
      ly += 4.5;
    }
    this.y += h + 8;
  }
}
