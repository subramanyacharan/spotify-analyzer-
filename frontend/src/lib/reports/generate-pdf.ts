import type { ExportReportDocument } from "./export-document";
import { PdfBuilder } from "./pdf-layout";

export async function downloadReportPdf(
  report: ExportReportDocument,
  filename?: string
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pdf = new PdfBuilder(doc);

  pdf.cover(report);

  // 1. Executive Summary
  pdf.section(
    1,
    "Executive Summary",
    "Concise overview of the most important analyzer findings, supported by review volume and scores."
  );
  pdf.subheading(report.executiveSummary.headline);
  pdf.body(report.executiveSummary.narrative);
  pdf.scorecards(report.executiveSummary.scorecards, 3);
  pdf.subheading("Key evidence");
  pdf.bullets(report.executiveSummary.proofPoints);
  if (report.meta.confidenceNote) {
    pdf.body(`Data confidence: ${report.meta.confidenceNote}`);
  }

  // 2. User Segment Ranking
  pdf.section(
    2,
    "User Segment Ranking",
    "Behavioral segments ordered by friction ranking score. Each rank includes volume, sentiment, pain, and business impact metrics."
  );
  pdf.table(
    [
      "Rank",
      "Segment",
      "Vol %",
      "Sentiment",
      "Pain",
      "Complaint %",
      "Business impact",
      "Rank score",
    ],
    report.rankedSegments.map((s) => [
      String(s.rank),
      s.name,
      `${s.reviewVolumePct}%`,
      `${s.sentimentScore}/5`,
      `${s.painScore}/5`,
      `${s.complaintFrequencyPct}%`,
      s.businessImpactScore.toFixed(2),
      s.rankingScore.toFixed(2),
    ]),
    [10, 34, 14, 16, 12, 16, 22, 18]
  );
  for (const seg of report.rankedSegments.slice(0, 6)) {
    pdf.rankingBlock(
      seg.rank,
      `${seg.name} — ${seg.definition.slice(0, 120)}`,
      seg.rankingProof,
      [
        { label: "Review volume", value: `${seg.reviewVolumePct}%` },
        { label: "Sentiment", value: `${seg.sentimentScore}/5` },
        { label: "Pain score", value: `${seg.painScore}/5` },
        { label: "Complaint frequency", value: `${seg.complaintFrequencyPct}%` },
        { label: "Business impact", value: seg.businessImpactScore.toFixed(2) },
        { label: "Ranking score", value: seg.rankingScore.toFixed(2) },
      ]
    );
  }

  // 3. Segment Breakdown
  pdf.section(
    3,
    "Segment Breakdown",
    "Detailed metrics and supporting evidence for each major behavioral segment."
  );
  for (const seg of report.segmentBreakdowns) {
    pdf.ensure(40);
    pdf.subheading(seg.name);
    pdf.body(`Definition: ${seg.definition}`);
    pdf.scorecards(seg.metrics, 3);
    pdf.body(seg.rankingProof);
    if (seg.topThemes.length) {
      pdf.table(
        ["Theme", "Definition", "Mentions", "Share"],
        seg.topThemes.map((t) => [
          t.theme,
          t.definition.slice(0, 50),
          String(t.count),
          `${t.pct}%`,
        ]),
        [36, 58, 22, 18]
      );
    }
    if (seg.topPains.length) {
      pdf.subheading("Top pain points in this segment");
      pdf.table(
        ["Pain point", "Reviews", "Share"],
        seg.topPains.map((p) => [p.summary.slice(0, 70), String(p.count), `${p.pct}%`]),
        [90, 24, 20]
      );
    }
    pdf.body(seg.discoverySignals);
    if (seg.sampleQuote) {
      pdf.body(`Sample review language: "${seg.sampleQuote}"`, 2);
    }
    pdf.y += 4;
  }

  // 4. Theme Analysis
  pdf.section(
    4,
    "Theme Analysis",
    "Major themes from the analyzer taxonomy, ranked by mention frequency with sentiment and pain signals."
  );
  pdf.table(
    ["Rank", "Theme", "Frequency", "Vol %", "Sentiment", "Pain", "Rank proof"],
    report.rankedThemes.map((t) => [
      String(t.rank),
      t.theme,
      t.frequency.toLocaleString(),
      `${t.frequencyPct}%`,
      `${t.sentimentPct}% neg`,
      `${t.painLevel}/5`,
      t.rankingProof.slice(0, 55),
    ]),
    [10, 32, 22, 14, 20, 14, 62]
  );
  for (const theme of report.rankedThemes.slice(0, 6)) {
    pdf.subheading(`#${theme.rank} ${theme.theme}`);
    pdf.body(theme.definition);
    pdf.body(theme.rankingProof);
  }

  // 5. Pain Point Ranking
  pdf.section(
    5,
    "Pain Point Ranking",
    "Major pain points ranked by impact score (complaint frequency × severity)."
  );
  for (const pain of report.rankedPainPoints) {
    pdf.rankingBlock(
      pain.rank,
      pain.label,
      pain.rankingProof,
      [
        { label: "Reviews", value: pain.reviewCount.toLocaleString() },
        { label: "Frequency", value: `${pain.complaintFrequencyPct}%` },
        { label: "Pain score", value: `${pain.painScore}/5` },
        { label: "Priority score", value: pain.rankingScore.toFixed(2) },
        { label: "Priority level", value: pain.tier },
      ]
    );
  }

  // 6. Discovery Behavior Analysis
  pdf.section(
    6,
    "Discovery Behavior Analysis",
    "Listening and discovery behavior patterns identified from review language in each behavioral segment."
  );
  pdf.table(
    ["Rank", "Segment", "Volume %", "Reviews", "Pain level", "Negative %", "Priority"],
    report.discoveryBehavior.map((d) => [
      String(d.rank),
      d.segment,
      `${d.volumePct}%`,
      d.reviewCount.toLocaleString(),
      `${d.painLevel}/5`,
      `${d.negativePct}%`,
      d.priorityScore.toFixed(2),
    ]),
    [10, 36, 16, 22, 18, 18, 18]
  );
  for (const row of report.discoveryBehavior) {
    pdf.subheading(`${row.segment}`);
    pdf.body(`Definition: ${row.definition}`);
    pdf.body(row.rankingProof);
  }

  // 7. Cross Segment Analysis
  pdf.section(
    7,
    "Cross Segment Analysis",
    "Important combinations of segment, listening behavior, and theme signals from analyzer outputs."
  );
  for (const cross of report.crossAnalysis) {
    pdf.subheading(cross.combination);
    pdf.body(cross.rankingProof);
    pdf.body(
      cross.metrics.map((m) => `${m.label}: ${m.value}`).join(" · ")
    );
    pdf.y += 3;
  }

  // 8. Opportunities Ranked
  pdf.section(
    8,
    "Opportunities Ranked",
    "Opportunity clusters ranked by composite impact score from the analyzer."
  );
  pdf.table(
    ["Rank", "Priority", "Impact score", "Opportunity"],
    report.keyOpportunities.map((o) => [
      String(o.rank),
      o.priorityLevel,
      o.impactScore.toFixed(2),
      o.name.slice(0, 80),
    ]),
    [12, 22, 24, 116]
  );
  for (const opp of report.keyOpportunities) {
    pdf.rankingBlock(opp.rank, opp.name.slice(0, 180), opp.rankingProof, opp.supportingMetrics);
  }

  // 9. Final Insights Summary
  pdf.section(
    9,
    "Final Insights Summary",
    "Structured summary of all important analyzer findings with supporting proof."
  );
  pdf.subheading(report.finalInsightsSummary.headline);
  pdf.scorecards(report.finalInsightsSummary.corpusMetrics, 3);
  for (const item of report.finalInsightsSummary.findings) {
    pdf.ensure(24);
    pdf.subheading(item.category);
    pdf.body(item.insight);
    pdf.body(`Proof: ${item.proof}`, 2);
    pdf.y += 2;
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(113, 113, 122);
    doc.text(
      `${report.meta.title} · Page ${p} of ${totalPages}`,
      18,
      287
    );
  }

  const name =
    filename ??
    `user-review-intelligence-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(name);
}
