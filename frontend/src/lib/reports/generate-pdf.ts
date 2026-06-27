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
    "Headline findings backed by review volume, sentiment, and priority scores."
  );
  pdf.subheading(report.executiveSummary.headline);
  pdf.body(report.executiveSummary.narrative);
  pdf.scorecards(report.executiveSummary.scorecards, 3);
  pdf.subheading("Evidence-backed highlights");
  pdf.bullets(report.executiveSummary.proofPoints);
  pdf.body(
    `Confidence note: ${report.meta.confidenceNote} Rankings below use friction scores (segment rank), impact scores (pain rank), and composite scores (opportunity rank) — higher always means higher priority in this period.`
  );

  // 2. Top User Segments Ranked
  pdf.section(
    2,
    "Top User Segments Ranked",
    "Segments ordered by friction ranking score — combining negative sentiment, pain severity, and review volume."
  );
  pdf.table(
    ["Rank", "Segment", "Vol %", "Sentiment", "Pain", "Rank Score"],
    report.rankedSegments.slice(0, 8).map((s) => [
      String(s.rank),
      s.name,
      `${s.reviewVolumePct}%`,
      `${s.sentimentScore}/5`,
      `${s.painScore}/5`,
      s.rankingScore.toFixed(2),
    ]),
    [12, 38, 18, 22, 18, 22]
  );
  pdf.barChart(
    "Friction ranking score by segment",
    report.rankedSegments.slice(0, 6).map((s) => ({
      label: s.name,
      value: s.rankingScore,
      display: s.rankingScore.toFixed(2),
    }))
  );

  // 3. Segment Breakdown
  pdf.section(
    3,
    "Segment Breakdown",
    "Definition, scorecard, and proof for each priority cohort."
  );
  for (const seg of report.segmentBreakdowns.slice(0, 5)) {
    pdf.ensure(50);
    pdf.subheading(`${seg.name}`);
    pdf.body(`Definition: ${seg.definition}`);
    pdf.scorecards(seg.metrics, 3);
    pdf.body(seg.rankingProof);
    if (seg.topThemes.length) {
      pdf.subheading("Top themes in this segment");
      pdf.table(
        ["Theme", "Mentions", "Share"],
        seg.topThemes.map((t) => [t.theme, String(t.count), `${t.pct}%`]),
        [70, 30, 30]
      );
    }
    if (seg.sampleQuote) {
      pdf.body(`Representative feedback: "${seg.sampleQuote}…"`, 2);
    }
    pdf.body(seg.discoverySignals);
    pdf.y += 4;
  }

  // 4. Top Pain Points Ranked
  pdf.section(
    4,
    "Top Pain Points Ranked",
    "Ordered by impact score (complaint frequency × severity). Tier reflects composite priority."
  );
  for (const pain of report.rankedPainPoints.slice(0, 6)) {
    pdf.rankingBlock(
      pain.rank,
      pain.painPoint.slice(0, 200),
      pain.rankingProof,
      [
        { label: "Reviews", value: pain.reviewCount.toLocaleString() },
        { label: "Frequency", value: `${pain.complaintFrequencyPct}%` },
        { label: "Pain score", value: `${pain.painScore}/5` },
        { label: "Tier", value: pain.tier },
        { label: "Priority", value: pain.rankingScore.toFixed(2) },
      ]
    );
  }

  // 5. Top Themes + Discovery
  pdf.section(
    5,
    "Discovery Behavior Analysis",
    "How listening intent signals differ across behavioral segments."
  );
  pdf.table(
    ["Segment", "Dominant intent", "Discovery %", "Comfort %", "Insight"],
    report.discoveryBehavior.map((d) => [
      d.segment,
      d.dominantIntent,
      `${d.discoveryPct}%`,
      `${d.comfortPct}%`,
      d.insight.slice(0, 55),
    ]),
    [32, 28, 22, 22, 70]
  );

  pdf.subheading("Top themes ranked by mention volume");
  for (const theme of report.rankedThemes.slice(0, 6)) {
    pdf.subheading(`#${theme.rank} ${theme.theme}`);
    pdf.body(`${theme.definition} — ${theme.rankingProof}`);
  }

  // 6. Segment Cross Analysis
  pdf.section(
    6,
    "Segment Cross Analysis",
    "Side-by-side comparison of the top two friction cohorts."
  );
  for (const cross of report.crossAnalysis) {
    pdf.callout(`${cross.segmentA} vs ${cross.segmentB}`, cross.strategicImplication);
    pdf.body(cross.frictionGap);
    pdf.body(cross.volumeComparison);
    if (cross.sharedThemes.length) {
      pdf.body(`Shared complaint themes: ${cross.sharedThemes.join(", ")}.`);
    }
  }

  // 7. Key Opportunities
  pdf.section(
    7,
    "Key Opportunities",
    "Product opportunities ranked by composite score (frequency × severity × segment impact)."
  );
  pdf.table(
    ["Rank", "Tier", "Composite", "Affected segment"],
    report.keyOpportunities.map((o) => [
      String(o.rank),
      o.tier,
      String(o.compositeScore),
      o.affectedSegment,
    ]),
    [14, 22, 24, 50]
  );
  for (const opp of report.keyOpportunities.slice(0, 4)) {
    pdf.rankingBlock(opp.rank, opp.title.slice(0, 180), opp.rankingProof, opp.scores);
    if (opp.productOpportunity) {
      pdf.body(`Product opportunity: ${opp.productOpportunity}`);
    }
    if (opp.featureRequest) {
      pdf.body(`Suggested feature direction: ${opp.featureRequest}`);
    }
  }

  // 8. Final Recommendation
  pdf.section(8, "Final Recommendation", "Single highest-priority action with proof and next steps.");
  pdf.callout(
    `${report.finalRecommendation.tier} priority · ${report.finalRecommendation.title.slice(0, 100)}`,
    report.finalRecommendation.action
  );
  pdf.subheading("Why this recommendation");
  pdf.body(report.finalRecommendation.proof);
  pdf.subheading("Expected impact");
  pdf.body(report.finalRecommendation.expectedImpact);
  pdf.subheading("Recommended next steps");
  pdf.bullets(report.finalRecommendation.nextSteps);

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(113, 113, 122);
    doc.text(
      `Product Research Report · Confidential · Page ${p} of ${totalPages}`,
      18,
      287
    );
  }

  const name =
    filename ??
    `product-research-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(name);
}