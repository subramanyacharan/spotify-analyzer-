"""Run Phase 3.4: Insight Prioritization Engine."""

import os
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

from src.phase3_knowledge.insight_prioritization import run_insight_prioritization_engine
from src.phase3_knowledge.problem_statement_engine import QueryFilters

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 3.4 — Insight Prioritization Engine")
    parser.add_argument("--source", type=str, default=None)
    parser.add_argument("--date-start", type=str, default=None)
    parser.add_argument("--date-end", type=str, default=None)
    parser.add_argument("--no-supabase", action="store_true")
    args = parser.parse_args()

    filt = QueryFilters(
        date_start=args.date_start,
        date_end=args.date_end,
        source=args.source,
    )
    result = run_insight_prioritization_engine(filters=filt, save_supabase=not args.no_supabase)

    print("\n--- Phase 3.4 Summary ---")
    print(f"  Reviews analyzed : {result['total_reviews_analyzed']:,}")
    print(f"  Tier summary     : {result['tier_summary']}")
    print(f"  Emerging issues  : {len(result['emerging_issues'])}")
    print(f"  Action items     : {len(result['prioritization_matrix'])}")
    if result.get("top_priority"):
        tp = result["top_priority"]
        print(f"\n  Top priority [#{tp['rank']} {tp['tier']}]")
        title = tp["title"]
        print(f"    {title[:140]}{'…' if len(title) > 140 else ''}")
