# Professional DOCX Reports

Two Word reports generated from existing analyzer JSON outputs. No analyzer or dashboard code is modified when these are built.

| File | Purpose |
|------|---------|
| `Project_Documentation_Report.docx` | Team reference: full architecture, phases, segmentation, scoring, and operations |
| `Analyzer_Insights_Report.docx` | 90-day business insights with complete sentences and rank justification |

## Regenerate

```bash
pip install python-docx
python scripts/generate_docx_reports.py
```

**Data source:** `data/outputs/*.json` (latest pipeline run). For live Supabase data, re-run the weekly pipeline first, then regenerate.

**Analysis window (insights report only):** Last 90 days · review count from `insight_prioritization.json` (`total_reviews_analyzed`).

**Insight text:** Reports and dashboard use complete sentences without trailing ellipsis truncation.
