# Phase 3 pipeline outputs

JSON files written by Phase 3 scripts (`scripts/run_*.py`). Used by:

- **Supabase** — primary source after pipeline upload
- **Frontend local fallback** — when `SUPABASE_*` env vars are unset, `frontend/` reads these files

| File | Producer |
|------|----------|
| `problem_statement_insights.json` | `run_problem_statement_engine.py` |
| `segment_deep_dives.json` | `run_segment_deep_dive.py` |
| `opportunity_scores.json` | `run_opportunity_scoring.py` |
| `insight_prioritization.json` | `run_insight_prioritization.py` |
| `weekly_report.json` | `run_weekly_report.py` (Phase 5.1) |

Do not delete these files if developing the dashboard without live Supabase.
