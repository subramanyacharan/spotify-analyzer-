"""Run Phase 3.3: Opportunity Scoring Engine."""

import os
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, project_root)

from src.phase3_knowledge.opportunity_scoring import run_opportunity_scoring_engine
from src.phase3_knowledge.problem_statement_engine import QueryFilters

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Phase 3.3 — Opportunity Scoring Engine")
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
    result = run_opportunity_scoring_engine(filters=filt, save_supabase=not args.no_supabase)

    print("\n--- Phase 3.3 Summary ---")
    print(f"  Reviews analyzed    : {result['total_reviews_analyzed']:,}")
    print(f"  Opportunities ranked: {len(result['opportunities'])}")
    for opp in result["opportunities"]:
        s = opp["scores"]
        text = opp["product_opportunity"]
        print(
            f"\n  #{opp['rank']} [{opp['tier']}] Cluster {opp['cluster_id']} — "
            f"score {s['composite']}"
        )
        print(f"    {text[:120]}{'…' if len(text) > 120 else ''}")
