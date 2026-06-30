# Professional DOCX Reports

Two Word reports generated from existing analyzer JSON outputs (90-day window). No analyzer or dashboard code is modified when these are built.

| File | Purpose |
|------|---------|
| `Project_Documentation_Report.docx` | End-to-end project documentation: architecture, phases, segmentation, scoring, prioritization |
| `Analyzer_Insights_Report.docx` | Business insights: ranked segments, pain points, themes, opportunities, recommendations |

## Regenerate

```bash
pip install python-docx
python scripts/generate_docx_reports.py
```

**Data source:** `data/outputs/*.json` (latest pipeline run). For live Supabase data, re-run the weekly pipeline first, then regenerate.

**Analysis window:** Last 90 days · review count from `insight_prioritization.json` (`total_reviews_analyzed`).
