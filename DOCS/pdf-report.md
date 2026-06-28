# PDF Report Export

The dashboard **Export Report** button (TopBar) generates a downloadable PDF from existing Phase 3 analyzer outputs. No analyzer logic, scoring formulas, or dashboard views are modified at export time — the report only formats stored data.

## Data sources

| Analyzer output | Used for |
|-----------------|----------|
| `insight_prioritization.json` / Supabase `top_themes.insight_prioritization` | Segment friction scores, pain points, opportunity rankings |
| `segment_deep_dives.json` / Supabase `top_themes.segment_deep_dives` | Segment profiles, themes, pain points, listening intent, cross-segment comparison |
| `weekly_report.json` / merged weekly snapshots | Executive summary text, problem-statement findings, sentiment |
| Merged weekly catalog | Period label, theme counts, confidence metadata |

**API:** Authenticated `GET /api/export/report?weeks=N` (1–12) returns JSON consumed client-side by `downloadReportPdf()`.

**Implementation files:**

- `frontend/src/lib/reports/export-document.ts` — builds structured report document from analyzer payloads
- `frontend/src/lib/reports/generate-pdf.ts` — renders nine PDF sections
- `frontend/src/lib/reports/pdf-layout.ts` — headings, tables, scorecards, ranking blocks
- `frontend/src/lib/reports/segment-definitions.ts` — plain-language segment and theme definitions

## Report structure (9 sections)

1. **Executive Summary** — Headline findings, scorecards, and evidence bullets from problem-statement answers and top rankings.
2. **User Segment Ranking** — Behavioral segments ranked by friction score with review volume %, sentiment score, pain score, complaint frequency, business impact score, and ranking proof explaining each position.
3. **Segment Breakdown** — Full metrics, top themes, top pain points, listening-intent signals, and sample review language per segment.
4. **Theme Analysis** — Themes ranked by mention frequency with definition, volume %, sentiment, pain level, and rank justification.
5. **Pain Point Ranking** — Pain points ranked by impact score (frequency × severity) with supporting metrics and short labels (e.g. repetitive recommendations, playlist fatigue).
6. **Discovery Behavior Analysis** — Behavioral segments with definition, volume, pain level, negative %, and priority score.
7. **Cross Segment Analysis** — Combined segment + listening intent + theme patterns from opportunity evidence and segment comparison data.
8. **Opportunities Ranked** — Opportunity clusters by composite impact score with priority level and supporting metrics.
9. **Final Insights Summary** — Structured findings across segments, themes, pain, behavior, opportunities, sentiment, and cross-segment patterns — each with proof. No action recommendations.

## Design principles

- **Insight-only** — No “should do”, “can improve”, or product recommendation language in the PDF.
- **Proof-backed** — Every ranking includes a “why this rank” explanation comparing scores and volumes.
- **Plain English** — Segment and theme definitions from `segment-definitions.ts`; technical terms explained inline.
- **Simple layout** — Clean headings, tables, and scorecards; no charts or heavy styling.

## Theme naming

Legacy theme label `Unrelated to Discovery` displays as **General App Feedback** in reports (same as dashboard).

## Analysis window

Report metrics reflect the analyzer’s 90-day analysis window and the selected number of weekly snapshots (`weeks` query parameter).
